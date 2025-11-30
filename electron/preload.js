// electron/preload.js

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
        return () => ipcRenderer.removeListener('model-download-progress', handler);
    },
    getModelsStatus: () => ipcRenderer.invoke('models:get-status'),

    // --- LLM 聊天 API ---
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
    semanticSearch: ({ queryText, traceId, excludeId }) =>
        ipcRenderer.invoke('vectors:search', { queryText, traceId, excludeId }),

    // --- [新增] 主题 API ---
    getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
    onThemeUpdate: (callback) => {
        const handler = (event, theme) => callback(theme);
        ipcRenderer.on('theme:updated', handler);
        return () => ipcRenderer.removeListener('theme:updated', handler);
    }
});