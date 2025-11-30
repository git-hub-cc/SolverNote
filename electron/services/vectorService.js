// electron/services/vectorService.js

const path = require('path');
const { app } = require('electron');
const matter = require('gray-matter');

// =======================================================================
// 常量定义
// =======================================================================
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const TABLE_NAME = "notes_vectors";

// =======================================================================
// 单例模式状态管理
// =======================================================================
let llama = null;
let embeddingModel = null;
let db = null;
let table = null;

/**
 * [内部辅助] 动态导入并初始化 LlamaCpp 核心引擎。
 * @private
 */
async function _initializeLlama() {
    if (llama) return;
    try {
        console.log('[Vector Service] 正在初始化 LlamaCpp 引擎...');
        const { getLlama } = await import('node-llama-cpp');
        llama = await getLlama();
        console.log('[Vector Service] LlamaCpp 引擎初始化成功。');
    } catch (error) {
        console.error('[Vector Service] LlamaCpp 引擎初始化失败:', error);
        throw new Error('无法初始化核心 AI 引擎 (node-llama-cpp)。');
    }
}

/**
 * 初始化向量服务。
 * @param {string} modelPath - GGUF 格式嵌入模型文件的绝对路径。
 * @returns {Promise<boolean>} 初始化成功返回 true，否则返回 false。
 */
async function initialize(modelPath) {
    if (!modelPath || typeof modelPath !== 'string') {
        console.error('[Vector Service] 初始化失败：无效的嵌入模型路径。');
        return false;
    }

    try {
        await _initializeLlama();
        const lancedb = await import('@lancedb/lancedb');

        console.log(`[Vector Service] 正在加载嵌入模型: ${path.basename(modelPath)}`);
        embeddingModel = await llama.loadModel({ modelPath });
        console.log('[Vector Service] 嵌入模型加载成功。');

        const dbPath = path.join(app.getPath('userData'), 'lancedb');
        console.log(`[Vector Service] 正在连接向量数据库，路径: ${dbPath}`);
        db = await lancedb.connect(dbPath);

        let dims = 384;
        if (embeddingModel && embeddingModel.metadata) {
            const embeddingLength = embeddingModel.metadata["llm.embedding_length"] || embeddingModel.metadata.embedding_length;
            if (typeof embeddingLength === 'number' && embeddingLength > 0) {
                dims = embeddingLength;
            }
        }
        console.log(`[Vector Service] 检测到嵌入模型维度: ${dims}`);

        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            table = await db.openTable(TABLE_NAME);
            console.log(`[Vector Service] 已成功打开现有向量表: ${TABLE_NAME}`);
        } else {
            console.log(`[Vector Service] 向量表不存在，正在创建新表: ${TABLE_NAME}`);
            const initialData = [{
                vector: Array(dims).fill(0.0),
                noteId: 'init_placeholder',
                chunkId: 0,
                text: 'Initial record',
                title: 'Initial Title'
            }];
            table = await db.createTable(TABLE_NAME, initialData);
            await table.delete(`"noteId" = 'init_placeholder'`);
            console.log(`[Vector Service] 新向量表 '${TABLE_NAME}' 创建成功，维度为 ${dims}。`);
        }

        return true;
    } catch (error) {
        console.error('[Vector Service] 初始化过程中发生严重错误:', error);
        embeddingModel = null;
        db = null;
        table = null;
        return false;
    }
}

/**
 * 为给定的文本片段创建嵌入向量。
 * @param {string} text - 需要被向量化的文本。
 * @returns {Promise<number[]>} - 嵌入向量（一个浮点数数组）。
 */
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
        console.error('[Vector Service] 创建嵌入向量时出错:', error);
        throw error;
    } finally {
        if (context) {
            await context.dispose();
        }
    }
}

/**
 * 将一篇笔记分割、向量化并存入 LanceDB。
 * @param {string} noteId - 笔记的唯一标识符。
 * @param {string} rawContent - 笔记的完整 Markdown 内容。
 */
async function indexNote(noteId, rawContent) {
    if (!table) {
        console.warn('[Vector Service] 向量表未初始化，跳过索引操作。');
        return;
    }
    try {
        await table.delete(`"noteId" = "${noteId}"`).catch(err => {
            console.warn(`[Vector Service] 清理笔记 '${noteId}' 的旧索引时出现非致命错误:`, err.message);
        });

        const { data, content } = matter(rawContent);
        const title = data.title || '';
        const contentToEmbed = content.trim();

        if (!contentToEmbed) {
            console.log(`[Vector Service] 笔记 '${noteId}' 内容为空，跳过索引。`);
            return;
        }

        const chunks = [];
        for (let i = 0; i < contentToEmbed.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
            chunks.push(contentToEmbed.substring(i, i + CHUNK_SIZE));
        }
        if (chunks.length === 0) return;

        console.log(`[Vector Service] 正在为笔记 '${noteId}' 创建 ${chunks.length} 个向量块...`);

        const dataToWrite = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            const vector = await createEmbedding(chunkText);
            dataToWrite.push({
                vector,
                noteId: noteId,
                chunkId: i,
                text: chunkText,
                title: title
            });
        }

        if (dataToWrite.length > 0) {
            await table.add(dataToWrite);
            console.log(`[Vector Service] 成功索引笔记 '${noteId}'（共 ${dataToWrite.length} 个块）。`);
        }
    } catch (error) {
        console.error(`[Vector Service] 索引笔记 '${noteId}' 失败:`, error);
    }
}

/**
 * 从 LanceDB 中删除指定笔记的所有相关索引。
 * @param {string} noteId - 要删除的笔记的 ID。
 */
async function deleteNoteIndex(noteId) {
    if (!table) return;
    try {
        await table.delete(`"noteId" = "${noteId}"`);
        console.log(`[Vector Service] 已从索引中删除笔记 '${noteId}' 的所有块。`);
    } catch (error) {
        console.error(`[Vector Service] 删除笔记 '${noteId}' 的索引失败:`, error);
    }
}

/**
 * 根据查询文本，在 LanceDB 中搜索语义上相似的笔记文本块。
 * @param {string} queryText - 用户的搜索查询。
 * @param {number} [limit=5] - 返回结果的最大数量。
 * @returns {Promise<Array<Object>>} - 包含相似笔记片段信息的数组。
 */
async function searchSimilarNotes(queryText, limit = 5) {
    if (!table) {
        console.warn('[Vector Service] 向量表未初始化，无法执行语义搜索。');
        return [];
    }
    try {
        console.log(`[Vector Service] 正在为查询创建嵌入: "${queryText.substring(0, 50)}..."`);
        const queryVector = await createEmbedding(queryText);
        console.log('[Vector Service] 嵌入创建成功，正在执行向量搜索...');

        const searchResults = await table.search(queryVector)
            .limit(limit)
            .execute();

        // --- 防御性编程与日志增强 ---
        // 检查 searchResults 的类型，并据此处理
        if (Array.isArray(searchResults)) {
            console.log(`[Vector Service] 搜索成功，直接返回了 ${searchResults.length} 个结果数组。`);
            // 如果是数组，直接处理
            return searchResults.map(r => ({
                id: r.noteId,
                snippet: r.text,
                title: r.title,
                similarity: Math.round(Math.max(0, 1 - r._distance) * 100)
            }));
        } else if (searchResults && typeof searchResults[Symbol.asyncIterator] === 'function') {
            // 如果是异步生成器
            console.log('[Vector Service] 搜索返回了一个异步生成器，正在迭代处理...');
            const resultsArray = [];
            for await (const r of searchResults) {
                resultsArray.push({
                    id: r.noteId,
                    snippet: r.text,
                    title: r.title,
                    similarity: Math.round(Math.max(0, 1 - r._distance) * 100)
                });
            }
            console.log(`[Vector Service] 异步生成器处理完成，共获得 ${resultsArray.length} 个结果。`);
            return resultsArray;
        } else {
            // 处理未知或意外的返回类型
            console.error('[Vector Service] 向量搜索返回了非预期的格式:', searchResults);
            // 记录构造函数名称，以帮助调试
            const constructorName = searchResults?.constructor?.name || typeof searchResults;
            console.error(`[Vector Service] 返回类型构造函数: ${constructorName}`);
            return [];
        }

    } catch (error) {
        console.error('[Vector Service] 语义搜索过程中发生严重错误:', error);
        return [];
    }
}

// 导出模块的公共 API
module.exports = {
    initialize,
    indexNote,
    deleteNoteIndex,
    searchSimilarNotes
};