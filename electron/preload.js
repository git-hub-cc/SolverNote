// electron/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- 笔记操作 API ---
    loadNotes: () => ipcRenderer.invoke('notes:load'),
    saveNote: (noteData) => ipcRenderer.invoke('notes:save', noteData),
    // [核心修改] 移除 searchNotes API
    // 由于搜索功能已完全迁移到前端 Pinia store 中处理，
    // 不再需要通过 IPC 调用后端进行搜索。
    // searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
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

    // --- [核心修改] 主题 API ---
    getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
    onThemeUpdate: (callback) => {
        const handler = (event, theme) => callback(theme);
        ipcRenderer.on('theme:updated', handler);
        return () => ipcRenderer.removeListener('theme:updated', handler);
    },

    /**
     * [新增] 向主进程发送设置原生主题的请求。
     * 这是一个单向通信 (send)，因为它不需要主进程的直接响应。
     * @param {'light' | 'dark' | 'system'} theme - 要应用的主题设置。
     */
    setNativeTheme: (theme) => ipcRenderer.send('theme:set', theme)
});