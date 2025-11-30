const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- 笔记操作 API ---
    loadNotes: () => ipcRenderer.invoke('notes:load'),
    saveNote: (noteData) => ipcRenderer.invoke('notes:save', noteData),
    searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
    deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

    // --- 模型管理 API ---
    listLocalModels: () => ipcRenderer.invoke('models:list'),
    downloadModel: (url, fileName) => ipcRenderer.invoke('models:download', { url, fileName }),
    getModelsDir: () => ipcRenderer.invoke('models:get-dir'),
    onModelDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('model-download-progress', handler);
        // 返回一个清理函数，以便 Vue 组件在卸载时可以移除监听器
        return () => ipcRenderer.removeListener('model-download-progress', handler);
    },

    // --- [新增] 模型状态查询 API ---
    // 这个函数将允许前端获取后端自动加载模型的结果。
    getModelsStatus: () => ipcRenderer.invoke('models:get-status'),

    // --- LLM 聊天 API ---
    // [移除] 不再需要 `loadLLM`，因为模型加载是自动的。
    // loadLLM: (modelPath) => ipcRenderer.invoke('llm:load-model', modelPath),

    // startChat 保持不变，但现在它依赖于后端已自动加载好的模型。
    startChat: (prompt, contextContent) => ipcRenderer.invoke('llm:start-chat', prompt, contextContent),

    // LLM 流式响应的监听器保持不变
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
    semanticSearch: (queryText) => ipcRenderer.invoke('vectors:search', queryText)
});