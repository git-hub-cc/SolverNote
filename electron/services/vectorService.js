// electron/services/vectorService.js

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const matter = require('gray-matter');
const log = require('electron-log');
const Store = require('electron-store');

const store = new Store();

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
 * [内部辅助函数] 获取用户配置的笔记存储目录。
 * @returns {string} 笔记目录的绝对路径。
 */
function getNotesDir() {
    const configuredPath = store.get('notesPath', path.join(process.cwd(), 'notes'));
    if (!fs.existsSync(configuredPath)) {
        fs.mkdirSync(configuredPath, { recursive: true });
    }
    return configuredPath;
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
        log.error(`[Vector Service] 初始化失败：无效的嵌入模型路径: ${modelPath}`);
        return false;
    }

    try {
        await _initializeLlama();
        const lancedb = await import('@lancedb/lancedb');

        log.info(`[Vector Service] 正在加载嵌入模型: ${path.basename(modelPath)}`);
        embeddingModel = await llama.loadModel({ modelPath });

        const dbPath = path.join(app.getPath('userData'), 'lancedb');
        log.info(`[Vector Service] 正在连接向量数据库，路径: ${dbPath}`);
        db = await lancedb.connect(dbPath);

        const embeddingLength = embeddingModel.metadata["llm.embedding_length"];
        const dims = typeof embeddingLength === 'number' && embeddingLength > 0 ? embeddingLength : 384;
        log.info(`[Vector Service] 检测到嵌入模型维度: ${dims}`);

        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            table = await db.openTable(TABLE_NAME);
            log.info(`[Vector Service] 已成功打开现有向量表: ${TABLE_NAME}`);
        } else {
            log.info(`[Vector Service] 向量表不存在，正在创建新表: ${TABLE_NAME}`);
            // 创建一个带正确维度的空表
            const initialData = [{ vector: Array(dims).fill(0.0), noteId: 'init_placeholder', chunkId: 0, text: 'Initial', title: 'Initial' }];
            table = await db.createTable(TABLE_NAME, initialData);
            await table.delete(`"noteId" = 'init_placeholder'`);
            log.info(`[Vector Service] 新向量表 '${TABLE_NAME}' 创建成功。`);
        }
        return true;
    } catch (error) {
        log.error('[Vector Service] 初始化过程中发生严重错误:', error);
        embeddingModel = null; db = null; table = null;
        throw error;
    }
}

// --- 向量创建与索引逻辑 ---

async function createEmbedding(text) {
    if (!embeddingModel) throw new Error("嵌入模型尚未加载。");
    let context = null;
    try {
        context = await embeddingModel.createEmbeddingContext();
        const embedding = await context.getEmbeddingFor(text);
        return embedding.vector;
    } finally {
        if (context) await context.dispose();
    }
}

async function indexNote(noteId, rawContent) {
    if (!table) {
        log.warn(`[Vector Service] 向量表未初始化，跳过笔记 '${noteId}' 的索引操作。`);
        return;
    }
    log.info(`[Vector Service] 开始为笔记 '${noteId}' 创建或更新索引...`);
    try {
        // 先删除旧索引，确保数据最新
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

        log.debug(`[Vector Service] 笔记 '${noteId}' 被切分为 ${chunks.length} 个块。`);
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
    log.info(`[Vector Service] 正在从索引中删除笔记 '${noteId}' 的所有相关数据...`);
    try {
        const result = await table.delete(`"noteId" = "${noteId}"`);
        log.info(`[Vector Service] 成功从索引中删除笔记 '${noteId}'。`);
    } catch (error) {
        log.error(`[Vector Service] 删除笔记 '${noteId}' 的索引失败:`, error);
    }
}

// --- 核心搜索逻辑 ---

async function searchSimilarNotes(queryText, traceId, excludeId) {
    if (!table) {
        log.warn(`[Vector Service][${traceId}] 向量表未初始化，无法执行搜索。`);
        return [];
    }
    log.info(`[Vector Service][${traceId}] 开始语义搜索...`);
    log.debug(`[Vector Service][${traceId}] Query: "${queryText.substring(0, 100)}...", Exclude ID: ${excludeId}`);

    try {
        const notesDir = getNotesDir();
        const queryVector = await createEmbedding(queryText);

        let queryBuilder = table.search(queryVector).limit(25); // 获取更多原始结果以供筛选
        if (excludeId) {
            queryBuilder = queryBuilder.where(`"noteId" != '${excludeId.replace(/'/g, "''")}'`);
        }
        const rawResults = await queryBuilder.toArray();
        log.debug(`[Vector Service][${traceId}] LanceDB 返回 ${rawResults.length} 条原始结果。`);

        const uniqueResults = [];
        const seenNoteIds = new Set();
        const ghostIdsToDelete = new Set();
        const targetLimit = 5;

        for (const result of rawResults) {
            if (uniqueResults.length >= targetLimit) break;
            if (seenNoteIds.has(result.noteId)) continue;

            const fullPath = path.join(notesDir, result.noteId);
            if (!fs.existsSync(fullPath)) {
                log.warn(`[Vector Service][${traceId}] 发现幽灵索引: ${result.noteId} (文件不存在)，将异步清理。`);
                ghostIdsToDelete.add(result.noteId);
                continue;
            }

            const similarity = Math.round(Math.max(0, 1 - result._distance) * 100);
            if (similarity > 99) { // 过滤掉几乎完全相同的内容
                log.debug(`[Vector Service][${traceId}] 排除过高相似度结果 (Sim: ${similarity}%), ID: ${result.noteId}`);
                continue;
            }

            seenNoteIds.add(result.noteId);
            uniqueResults.push({
                id: result.noteId, snippet: result.text, title: result.title, similarity
            });
        }

        if (ghostIdsToDelete.size > 0) {
            (async () => {
                log.info(`[Vector Service][${traceId}] 开始异步清理 ${ghostIdsToDelete.size} 条幽灵索引...`);
                for (const ghostId of ghostIdsToDelete) await deleteNoteIndex(ghostId);
            })();
        }

        log.info(`[Vector Service][${traceId}] 搜索完成，返回 ${uniqueResults.length} 条有效结果。`);
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