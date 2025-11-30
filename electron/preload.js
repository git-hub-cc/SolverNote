// electron/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- 笔记操作 API (保持不变) ---
    loadNotes: () => ipcRenderer.invoke('notes:load'),
    saveNote: (noteData) => ipcRenderer.invoke('notes:save', noteData),
    searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
    deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

    // --- 模型管理 API (保持不变) ---
    listLocalModels: () => ipcRenderer.invoke('models:list'),
    downloadModel: (url, fileName) => ipcRenderer.invoke('models:download', { url, fileName }),
    getModelsDir: () => ipcRenderer.invoke('models:get-dir'),
    onModelDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('model-download-progress', handler);
        return () => ipcRenderer.removeListener('model-download-progress', handler);
    },
    getModelsStatus: () => ipcRenderer.invoke('models:get-status'),

    // --- LLM 聊天 API (保持不变) ---
    startChat: (prompt, contextContent) => ipcRenderer.invoke('llm:start-chat', prompt, contextContent),
    onLLMToken: (callback) => {
        const handler = (event, token) => callback(token);
        ipcRenderer.on('llm-token-stream', handler);
        return () => ipcRenderer.removeListener('llm-token-stream', handler);
    },
    onLLMEnd: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('llm-stream-end', handler);
        return () => ipcRenderer.removeListener('llm-stream-end', handler);
    },
    onLLMError: (callback) => {
        const handler = (event, errorMsg) => callback(errorMsg);
        ipcRenderer.on('llm-stream-error', handler);
        return () => ipcRenderer.removeListener('llm-stream-error', handler);
    },

    // --- 向量搜索 API ---
    /**
     * [核心修改] 修改 `semanticSearch` 函数签名以支持传递 Trace ID。
     * 现在它接受一个对象 { queryText, traceId } 作为参数，而不是单个字符串。
     *
     * @param {string} queryText - 用户的搜索查询。
     * @param {string} traceId - 用于追踪本次请求的唯一ID。
     * @returns {Promise<Array<Object>>} - 包含相似笔记片段信息的数组。
     */
    semanticSearch: (queryText, traceId) => ipcRenderer.invoke('vectors:search', { queryText, traceId })
});