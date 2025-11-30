// electron/services/vectorService.js

const path = require('path');
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

// _initializeLlama, initialize, createEmbedding, indexNote, deleteNoteIndex 函数保持不变
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

/**
 * 根据查询文本，在 LanceDB 中搜索语义上相似的笔记文本块。
 * @param {string} queryText - 用户的搜索查询。
 * @param {string} traceId - 用于追踪本次请求的唯一ID。
 * @param {number} [limit=5] - 返回结果的最大数量。
 * @returns {Promise<Array<Object>>} - 包含相似笔记片段信息的数组。
 */
async function searchSimilarNotes(queryText, traceId, limit = 5) {
    if (!table) {
        log.warn(`[Vector Service][${traceId}] 向量表未初始化，无法执行语义搜索。`);
        return [];
    }
    try {
        // --- 1. 生成查询向量 ---
        log.debug(`[Vector Service][${traceId}] 正在为查询创建嵌入向量...`, {
            payload: { queryText: `${queryText.substring(0, 50)}...` }
        });
        const queryVector = await createEmbedding(queryText);
        log.debug(`[Vector Service][${traceId}] 查询向量创建成功。`, {
            payload: {
                vectorPreview: queryVector.slice(0, 5),
                vectorDim: queryVector.length
            }
        });

        // --- 2. 调用 LanceDB 搜索 ---
        const searchParams = { limit, metric: 'l2' };
        log.debug(`[Vector Service][${traceId}] 正在调用 LanceDB search 方法...`, {
            payload: searchParams
        });

        // ======================= 核心修复 =======================
        // 问题: `Array.fromAsync` 在当前 Node.js 环境中不可用。
        // 修复: 使用 `for await...of` 循环来手动遍历异步迭代器，并将结果收集到一个数组中。
        // 这是处理异步迭代器最通用和兼容性最好的方法。

        const searchResultIterator = await table.search(queryVector)
            .limit(limit)
            .execute();

        const searchResults = [];
        for await (const result of searchResultIterator) {
            searchResults.push(result);
        }
        // ==========================================================

        // --- 3. 记录 LanceDB 的原始返回 ---
        if (!Array.isArray(searchResults)) {
            // 这个检查现在更像是一个额外的保障
            log.error(`[Vector Service][${traceId}] LanceDB 返回了非预期的格式 (非数组)，即使在转换后。`, {
                payload: { type: typeof searchResults, constructor: searchResults?.constructor?.name }
            });
            throw new Error('LanceDB search returned an unexpected format.');
        }

        log.debug(`[Vector Service][${traceId}] 从 LanceDB 接收到原始结果。`, {
            payload: { rawResults: searchResults }
        });

        // --- 4. 格式化结果 ---
        const formattedResults = searchResults.map(r => ({
            id: r.noteId,
            snippet: r.text,
            title: r.title,
            similarity: Math.round(Math.max(0, 1 - r._distance) * 100)
        }));

        log.debug(`[Vector Service][${traceId}] 结果已格式化，准备返回。`, {
            payload: { formattedResults }
        });

        return formattedResults;

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