const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- 原有笔记操作 API ---
    loadNotes: () => ipcRenderer.invoke('notes:load'),
    saveNote: (noteData) => ipcRenderer.invoke('notes:save', noteData),
    searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
    deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

    // --- [新增] 模型管理 API ---
    listLocalModels: () => ipcRenderer.invoke('models:list'),
    downloadModel: (url, fileName) => ipcRenderer.invoke('models:download', { url, fileName }),
    getModelsDir: () => ipcRenderer.invoke('models:get-dir'),
    onModelDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('model-download-progress', handler);
        // 返回一个取消监听的函数，用于组件卸载时清理
        return () => ipcRenderer.removeListener('model-download-progress', handler);
    },

    // --- [新增] LLM 聊天 API ---
    loadLLM: (modelPath) => ipcRenderer.invoke('llm:load-model', modelPath),
    startChat: (prompt) => ipcRenderer.invoke('llm:start-chat', prompt),
    // 关键：为流式响应设置监听器
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

    // --- [新增] 向量搜索 API ---
    semanticSearch: (queryText) => ipcRenderer.invoke('vectors:search', queryText)
});