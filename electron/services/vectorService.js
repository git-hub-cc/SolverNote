// [修改] 删除了顶部的 require 语句
const path = require('path');
const { app } = require('electron');

// 单例模式，管理嵌入模型和数据库实例
let embeddingModel = null;
let db = null;
let table = null;

const TABLE_NAME = "notes_vectors";

/**
 * 初始化向量服务
 * @param {string} modelPath - BGE 等嵌入模型的 GGUF 文件路径
 * @returns {Promise<boolean>} 初始化是否成功
 */
async function initialize(modelPath) {
    // [修改] 动态导入 ESM 模块
    const { LlamaModel, LlamaContext, LlamaEmbeddingContext } = await import("node-llama-cpp");
    const lancedb = await import("@lancedb/lancedb");

    try {
        // 1. 加载嵌入模型
        console.log(`正在加载嵌入模型: ${modelPath}`);
        embeddingModel = new LlamaModel({ modelPath });
        console.log('嵌入模型加载成功。');

        // 2. 初始化 LanceDB
        const dbPath = path.join(app.getPath('userData'), 'lancedb');
        console.log(`正在连接向量数据库: ${dbPath}`);
        db = await lancedb.connect(dbPath);

        // 3. 获取或创建表
        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            table = await db.openTable(TABLE_NAME);
            console.log(`已打开表: ${TABLE_NAME}`);
        } else {
            // 假设嵌入维度为 384 (bge-small)
            const context = new LlamaContext({ model: embeddingModel });
            const embeddingContext = new LlamaEmbeddingContext({ context });
            const dims = embeddingContext.getEmbeddingSize();
            context.dispose(); // 用完即释放

            // 创建一个空数组和 schema 来初始化表
            table = await db.createTable(TABLE_NAME, [{ vector: Array(dims).fill(0), id: 'init', text: 'init' }]);
            await table.delete("id = 'init'"); // 删除初始化数据
            console.log(`已创建新表: ${TABLE_NAME}，向量维度: ${dims}`);
        }

        return true;
    } catch (error) {
        console.error('初始化向量服务失败:', error);
        return false;
    }
}

/**
 * 为给定的文本创建向量嵌入
 * @param {string} text - 输入文本
 * @returns {Promise<number[]>} 文本的向量表示
 */
async function createEmbedding(text) {
    if (!embeddingModel) throw new Error("嵌入模型未加载。");

    // [修改] 动态导入 ESM 模块
    const { LlamaContext, LlamaEmbeddingContext } = await import("node-llama-cpp");

    const context = new LlamaContext({ model: embeddingModel });
    const embeddingContext = new LlamaEmbeddingContext({ context });

    const embedding = await embeddingContext.getEmbedding(text);

    context.dispose(); // 释放资源
    return embedding.vector;
}

/**
 * 索引一篇笔记（新增或更新）
 * @param {string} noteId - 笔记的唯一标识 (文件名)
 * @param {string} content - 笔记的内容
 */
async function indexNote(noteId, content) {
    if (!table) return;
    try {
        // 先尝试删除旧的记录，确保数据最新
        await table.delete(`id = "${noteId}"`).catch(() => {});

        const vector = await createEmbedding(content);

        // 截取部分内容作为预览
        const snippet = content.substring(0, 150).replace(/\n/g, ' ');

        await table.add([{ vector, id: noteId, text: snippet }]);
        console.log(`已索引笔记: ${noteId}`);
    } catch (error) {
        console.error(`索引笔记 ${noteId} 失败:`, error);
    }
}

/**
 * 从索引中删除一篇笔记
 * @param {string} noteId - 笔记的唯一标识 (文件名)
 */
async function deleteNoteIndex(noteId) {
    if (!table) return;
    try {
        await table.delete(`id = "${noteId}"`);
        console.log(`已从索引中删除: ${noteId}`);
    } catch (error) {
        console.error(`删除索引 ${noteId} 失败:`, error);
    }
}

/**
 * 搜索与查询文本相似的笔记
 * @param {string} queryText - 查询文本
 * @param {number} limit - 返回结果数量
 * @returns {Promise<object[]>} 相似笔记列表
 */
async function searchSimilarNotes(queryText, limit = 5) {
    if (!table) return [];
    try {
        const queryVector = await createEmbedding(queryText);
        const results = await table.search(queryVector).limit(limit).execute();

        return results.map(r => ({
            id: r.id,
            snippet: r.text,
            // _distance 是 LanceDB 返回的距离，越小越相似。可以转换为 0-100 的相似度分值
            similarity: Math.round(Math.max(0, 1 - r._distance) * 100)
        }));
    } catch (error) {
        console.error('语义搜索失败:', error);
        return [];
    }
}

module.exports = {
    initialize,
    indexNote,
    deleteNoteIndex,
    searchSimilarNotes
};