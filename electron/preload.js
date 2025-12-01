// electron/preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- 笔记与文件系统 API ---
    loadNotes: () => ipcRenderer.invoke('notes:load'),
    saveNote: (noteData) => ipcRenderer.invoke('notes:save', noteData),
    deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

    // [Phase 2 新增]
    getFileTree: () => ipcRenderer.invoke('fs:get-tree'), // 需在 main.js 注册
    createFolder: (path) => ipcRenderer.invoke('fs:create-folder', path),
    renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    movePath: (sourcePath, targetDir) => ipcRenderer.invoke('fs:move', sourcePath, targetDir),

    onNotesUpdated: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('notes:updated', handler);
        return () => ipcRenderer.removeListener('notes:updated', handler);
    },

    // --- 设置 API ---
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    selectFolder: () => ipcRenderer.invoke('settings:select-folder'),
    openPath: (path) => ipcRenderer.invoke('shell:open-path', path),

    // --- AI 与模型 API ---
    listLocalModels: () => ipcRenderer.invoke('models:list'),
    downloadModel: (url, fileName) => ipcRenderer.invoke('models:download', { url, fileName }),
    getModelsDir: () => ipcRenderer.invoke('models:get-dir'),
    onModelDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('model-download-progress', handler);
        return () => ipcRenderer.removeListener('model-download-progress', handler);
    },
    getModelsStatus: () => ipcRenderer.invoke('models:get-status'),

    // --- LLM 功能 ---
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
    generateTags: (prompt) => ipcRenderer.invoke('llm:generate-tags', prompt),

    // --- 向量搜索 ---
    semanticSearch: ({ queryText, traceId, excludeId }) =>
        ipcRenderer.invoke('vectors:search', { queryText, traceId, excludeId }),

    // --- 主题 ---
    getSystemTheme: () => ipcRenderer.invoke('theme:get-system'),
    onThemeUpdate: (callback) => {
        const handler = (event, theme) => callback(theme);
        ipcRenderer.on('theme:updated', handler);
        return () => ipcRenderer.removeListener('theme:updated', handler);
    },
    setNativeTheme: (theme) => ipcRenderer.send('theme:set', theme)
});