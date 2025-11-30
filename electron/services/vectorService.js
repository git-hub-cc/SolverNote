// electron/services/vectorService.js

const path = require('path');
const fs = require('fs'); // [新增] 引入 fs 模块用于校验文件存在性
const { app } = require('electron');
const matter = require('gray-matter');
const log = require('electron-log');

// 常量定义
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const TABLE_NAME = "notes_vectors";

// 单例模式状态管理
let llama = null;
let embeddingModel = null;
let db = null;
let table = null;

/**
 * 内部辅助：获取笔记存储目录
 * 确保与 handlers.js 中的逻辑一致
 */
function getNotesDir() {
    const noteDir = path.join(process.cwd(), 'notes');
    if (!fs.existsSync(noteDir)) {
        fs.mkdirSync(noteDir, { recursive: true });
    }
    return noteDir;
}

// --- 初始化逻辑 ---

async function _initializeLlama() {
    if (llama) return;
    try {
        log.info('[Vector Service] 正在初始化 LlamaCpp 引擎...');
        const { getLlama } = await import('node-llama-cpp');
        llama = await getLlama();
        log.info('[Vector Service] LlamaCpp 引擎初始化成功。');
    } catch (error) {
        log.error('[Vector Service] LlamaCpp 引擎初始化失败:', error);
        throw new Error('无法初始化核心 AI 引擎 (node-llama-cpp)。');
    }
}

async function initialize(modelPath) {
    if (!modelPath || typeof modelPath !== 'string') {
        log.error('[Vector Service] 初始化失败：无效的嵌入模型路径。');
        return false;
    }

    try {
        await _initializeLlama();
        const lancedb = await import('@lancedb/lancedb');

        log.info(`[Vector Service] 正在加载嵌入模型: ${path.basename(modelPath)}`);
        embeddingModel = await llama.loadModel({ modelPath });
        log.info('[Vector Service] 嵌入模型加载成功。');

        const dbPath = path.join(app.getPath('userData'), 'lancedb');
        log.info(`[Vector Service] 正在连接向量数据库，路径: ${dbPath}`);
        db = await lancedb.connect(dbPath);

        let dims = 384;
        if (embeddingModel && embeddingModel.metadata) {
            const embeddingLength = embeddingModel.metadata["llm.embedding_length"] || embeddingModel.metadata.embedding_length;
            if (typeof embeddingLength === 'number' && embeddingLength > 0) {
                dims = embeddingLength;
            }
        }
        log.info(`[Vector Service] 检测到嵌入模型维度: ${dims}`);

        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            table = await db.openTable(TABLE_NAME);
            log.info(`[Vector Service] 已成功打开现有向量表: ${TABLE_NAME}`);
        } else {
            log.info(`[Vector Service] 向量表不存在，正在创建新表: ${TABLE_NAME}`);
            const initialData = [{
                vector: Array(dims).fill(0.0),
                noteId: 'init_placeholder',
                chunkId: 0,
                text: 'Initial record',
                title: 'Initial Title'
            }];
            table = await db.createTable(TABLE_NAME, initialData);
            await table.delete(`"noteId" = 'init_placeholder'`);
            log.info(`[Vector Service] 新向量表 '${TABLE_NAME}' 创建成功，维度为 ${dims}。`);
        }
        return true;
    } catch (error) {
        log.error('[Vector Service] 初始化过程中发生严重错误:', error);
        embeddingModel = null;
        db = null;
        table = null;
        throw error;
    }
}

// --- 向量创建与索引逻辑 ---

async function createEmbedding(text) {
    if (!embeddingModel) {
        throw new Error("嵌入模型尚未加载，无法创建向量。");
    }
    let context = null;
    try {
        context = await embeddingModel.createEmbeddingContext();
        const embedding = await context.getEmbeddingFor(text);
        return embedding.vector;
    } catch (error) {
        log.error('[Vector Service] 创建嵌入向量时出错:', error);
        throw error;
    } finally {
        if (context) {
            await context.dispose();
        }
    }
}

async function indexNote(noteId, rawContent) {
    if (!table) {
        log.warn(`[Vector Service] 向量表未初始化，跳过笔记 '${noteId}' 的索引操作。`);
        return;
    }
    try {
        await table.delete(`"noteId" = "${noteId}"`).catch(() => {});

        const { data, content } = matter(rawContent);
        const title = data.title || '';
        const contentToEmbed = content.trim();

        if (!contentToEmbed) {
            log.info(`[Vector Service] 笔记 '${noteId}' 内容为空，跳过索引。`);
            return;
        }

        const chunks = [];
        for (let i = 0; i < contentToEmbed.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
            chunks.push(contentToEmbed.substring(i, i + CHUNK_SIZE));
        }
        if (chunks.length === 0) return;

        log.info(`[Vector Service] 正在为笔记 '${noteId}' 创建 ${chunks.length} 个向量块...`);
        const dataToWrite = [];
        for (let i = 0; i < chunks.length; i++) {
            const vector = await createEmbedding(chunks[i]);
            dataToWrite.push({ vector, noteId, chunkId: i, text: chunks[i], title });
        }

        if (dataToWrite.length > 0) {
            await table.add(dataToWrite);
            log.info(`[Vector Service] 成功索引笔记 '${noteId}'（共 ${dataToWrite.length} 个块）。`);
        }
    } catch (error) {
        log.error(`[Vector Service] 索引笔记 '${noteId}' 失败:`, error);
    }
}

async function deleteNoteIndex(noteId) {
    if (!table) return;
    try {
        await table.delete(`"noteId" = "${noteId}"`);
        log.info(`[Vector Service] 已从索引中删除笔记 '${noteId}' 的所有块。`);
    } catch (error) {
        log.error(`[Vector Service] 删除笔记 '${noteId}' 的索引失败:`, error);
    }
}

// --- 核心搜索逻辑 (重点修改部分) ---

/**
 * 根据查询文本，在 LanceDB 中搜索语义上相似的笔记文本块。
 *
 * 增强功能：
 * 1. 幽灵数据清洗：自动检测并删除数据库中存在但文件系统中已不存在的索引。
 * 2. 相似度熔断：如果内容相似度过高(>99.5%)，即使ID不同也视为重复内容过滤。
 * 3. 严格ID过滤：使用 NFC 标准化确保跨平台文件名匹配准确。
 *
 * @param {string} queryText - 用户的搜索查询。
 * @param {string} traceId - 用于追踪本次请求的唯一ID。
 * @param {string} [excludeId] - (可选) 需要排除的笔记ID。
 * @param {number} [targetLimit=5] - 最终返回给前端的非重复结果数量。
 * @returns {Promise<Array<Object>>} - 包含相似笔记片段信息的数组。
 */
async function searchSimilarNotes(queryText, traceId, excludeId, targetLimit = 5) {
    if (!table) {
        log.warn(`[Vector Service][${traceId}] 向量表未初始化，无法执行语义搜索。`);
        return [];
    }
    try {
        const notesDir = getNotesDir();

        // --- 1. 生成查询向量 ---
        log.debug(`[Vector Service][${traceId}] 正在为查询创建嵌入向量...`);
        const queryVector = await createEmbedding(queryText);

        // --- 2. 构造查询链 ---
        // 策略：过量获取 (Over-fetching)，取 5 倍数量以应对过滤带来的损耗
        const fetchLimit = targetLimit * 5;
        let queryBuilder = table.search(queryVector).limit(fetchLimit);

        // 标准化排除 ID (解决 macOS NFC/NFD 问题)
        const normalizedExcludeId = excludeId ? excludeId.normalize('NFC') : null;

        // 策略 A：数据库层过滤 (SQL Filtering)
        // 这是一个“尽力而为”的优化
        if (normalizedExcludeId) {
            // 防止 SQL 注入的简单转义
            const safeExcludeId = normalizedExcludeId.replace(/'/g, "''");
            queryBuilder = queryBuilder.where(`"noteId" != '${safeExcludeId}'`);
        }

        // --- 3. 执行查询 ---
        const rawResults = await queryBuilder.toArray();

        // --- 4. 深度清洗与过滤 ---
        const uniqueResults = [];
        const seenNoteIds = new Set();

        // 用于收集无效的幽灵 ID，搜索结束后批量删除
        const ghostIdsToDelete = new Set();

        for (const result of rawResults) {
            const currentId = result.noteId;
            const normalizedCurrentId = currentId.normalize('NFC');

            // --- 过滤条件 1: ID 绝对匹配 ---
            // 即使数据库 where 漏了，这里也要防守住
            if (normalizedExcludeId && normalizedCurrentId === normalizedExcludeId) {
                continue;
            }

            // --- 过滤条件 2: 幽灵数据检测 (关键修复) ---
            // 检查该 ID 对应的文件是否真的存在于磁盘上
            // 解决问题：数据库里有 'note-OLD.md'，但磁盘上实际只有 'MyNote.md'
            const fullPath = path.join(notesDir, currentId);
            if (!fs.existsSync(fullPath)) {
                log.warn(`[Vector Service][${traceId}] 发现幽灵索引: ${currentId} (文件不存在)。标记为自动清理。`);
                ghostIdsToDelete.add(currentId);
                continue; // 跳过此结果
            }

            // --- 过滤条件 3: 去重 ---
            if (seenNoteIds.has(normalizedCurrentId)) continue;

            // --- 过滤条件 4: 相似度熔断 (关键修复) ---
            // 如果 ID 不同，但相似度 > 99.5%，说明内容几乎完全一致。
            // 这通常意味着这是一个改名残留的索引，或者完全一样的副本。
            const similarityRaw = 1 - result._distance;
            if (similarityRaw > 0.995) {
                log.info(`[Vector Service][${traceId}] 排除过高相似度结果 (Sim: ${similarityRaw.toFixed(4)}), ID: ${currentId}`);
                continue;
            }

            // --- 通过所有检查，加入结果 ---
            seenNoteIds.add(normalizedCurrentId);
            uniqueResults.push({
                id: currentId,
                snippet: result.text,
                title: result.title,
                similarity: Math.round(Math.max(0, similarityRaw) * 100)
            });

            if (uniqueResults.length >= targetLimit) break;
        }

        // --- 5. 异步清理幽灵数据 ---
        if (ghostIdsToDelete.size > 0) {
            // 不等待清理完成，直接返回结果，清理在后台进行
            await (async () => {
                for (const ghostId of ghostIdsToDelete) {
                    await deleteNoteIndex(ghostId);
                }
                log.info(`[Vector Service] 后台已清理 ${ghostIdsToDelete.size} 条幽灵索引记录。`);
            })();
        }

        log.info(`[Vector Service][${traceId}] 搜索完成。返回 ${uniqueResults.length} 条有效结果。`);

        return uniqueResults;

    } catch (error) {
        log.error(`[Vector Service][${traceId}] 语义搜索过程中发生严重错误:`, error);
        throw error;
    }
}

module.exports = {
    initialize,
    indexNote,
    deleteNoteIndex,
    searchSimilarNotes
};