// electron/main.js

const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs-extra');
const log = require('electron-log');
const Store = require('electron-store');

// --- 日志配置 ---
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs/main.log');
log.level = process.env.SOLVER_LOG_LEVEL || (app.isPackaged ? 'info' : 'debug');

console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;
console.debug = log.debug;

// --- 初始化 Store ---
const store = new Store({
    schema: {
        notesPath: {
            type: 'string',
            default: path.join(process.cwd(), 'notes')
        },
        deleteMode: {
            type: 'string',
            enum: ['trash', 'permanent'],
            default: 'trash'
        }
    }
});

// 引入本地模块
const {
    handleLoadNotes,
    handleSaveNote,
    handleDeleteNote,
    // [Phase 2 新增] 引入新的文件系统处理函数
    handleGetFileTree,
    handleCreateFolder,
    handleRenamePath,
    handleMovePath
} = require('./handlers');

const modelManager = require('./services/modelManager');
const llmService = require('./services/llmService');
const vectorService = require('./services/vectorService');

// 定义模型文件名
const CHAT_MODEL_FILENAME = 'qwen1_5-0_5b-chat-q4_k_m.gguf';
const EMBEDDING_MODEL_FILENAME = 'bge-small-en-v1.5.Q8_0.gguf';

// 全局状态
const modelStatus = {
    chat: 'Uninitialized',
    embedding: 'Uninitialized'
};

const isDev = !app.isPackaged;
let mainWindow = null;
let watcher = null;

// --- 辅助函数：获取当前配置的笔记目录 ---
function getNotesDir() {
    const configuredPath = store.get('notesPath');
    fs.ensureDirSync(configuredPath);
    return configuredPath;
}

// --- 核心业务函数  ---
async function reindexAllNotes() {
    console.info('[AI] Starting full re-index...');
    try {
        const allNotes = await handleLoadNotes();
        if (allNotes.length === 0) {
            console.info('[AI] No notes to index.');
            return;
        }

        let indexedCount = 0;
        for (const note of allNotes) {
            await vectorService.indexNote(note.id, note.rawContent);
            indexedCount++;
        }
        console.info(`[AI] Re-index complete. Processed ${indexedCount} notes.`);
    } catch (error) {
        console.error('[AI] Error during re-indexing:', error);
    }
}

// --- 文件监听器设置 ---
function setupFileWatcher() {
    if (watcher) {
        watcher.close().then(() => console.info('Old file watcher closed.'));
    }

    const notesDir = getNotesDir();

    // 配置递归监听
    watcher = chokidar.watch(path.join(notesDir, '**/*.md'), {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        depth: 99,
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100
        }
    });

    console.info(`Watching directory: ${notesDir}`);

    const getRelativeId = (filePath) => {
        return path.relative(notesDir, filePath).split(path.sep).join('/');
    };

    const notifyFrontend = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notes:updated');
        }
    };

    watcher.on('add', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = getRelativeId(filePath);
        console.info(`New file detected: ${noteId}, indexing...`);
        notifyFrontend();
        await vectorService.indexNote(noteId, rawContent);
    });

    watcher.on('change', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = getRelativeId(filePath);
        console.info(`File changed: ${noteId}, re-indexing...`);
        notifyFrontend();
        await vectorService.indexNote(noteId, rawContent);
    });

    watcher.on('unlink', (filePath) => {
        const noteId = getRelativeId(filePath);
        console.info(`File deleted: ${noteId}, removing index...`);
        notifyFrontend();
        vectorService.deleteNoteIndex(noteId);
    });
}

async function initializeAIServices() {
    const modelsDir = modelManager.getModelsDir();

    // 初始化聊天模型
    const chatModelPath = path.join(modelsDir, CHAT_MODEL_FILENAME);
    modelStatus.chat = 'Loading';
    if (await fs.pathExists(chatModelPath)) {
        try {
            const success = await llmService.loadModel(chatModelPath);
            if (success) {
                modelStatus.chat = 'Ready';
                console.info('[AI] Chat model ready.');
            } else {
                throw new Error('llmService.loadModel returned false');
            }
        } catch (error) {
            modelStatus.chat = 'Error';
            console.error('[AI] Failed to load chat model:', error);
        }
    } else {
        modelStatus.chat = 'Not Found';
    }

    // 初始化嵌入模型
    const embeddingModelPath = path.join(modelsDir, EMBEDDING_MODEL_FILENAME);
    modelStatus.embedding = 'Loading';
    if (await fs.pathExists(embeddingModelPath)) {
        try {
            const success = await vectorService.initialize(embeddingModelPath);
            if (success) {
                modelStatus.embedding = 'Ready';
                console.info('[AI] Vector service ready.');
                await reindexAllNotes();
                setupFileWatcher();
            } else {
                throw new Error('vectorService.initialize returned false');
            }
        } catch (error) {
            modelStatus.embedding = 'Error';
            console.error('[AI] Failed to initialize vector service:', error);
        }
    } else {
        modelStatus.embedding = 'Not Found';
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
            devTools: isDev
        }
    });

    nativeTheme.on('updated', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
            mainWindow.webContents.send('theme:updated', theme);
        }
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(async () => {
    console.info('================ APP STARTED ================');
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
    }

    // --- 注册基础 IPC ---
    ipcMain.handle('notes:load', handleLoadNotes);
    ipcMain.handle('notes:save', handleSaveNote);
    ipcMain.handle('notes:delete', handleDeleteNote);

    // --- [Phase 2 新增] 注册文件系统 IPC ---
    // 这里注册 preload.js 中调用的 fs:* 通道
    ipcMain.handle('fs:get-tree', handleGetFileTree);
    ipcMain.handle('fs:create-folder', handleCreateFolder);
    ipcMain.handle('fs:rename', handleRenamePath);
    ipcMain.handle('fs:move', handleMovePath);

    // --- 注册设置 IPC ---
    ipcMain.handle('settings:get', () => store.store);
    ipcMain.handle('settings:set', (event, key, value) => {
        store.set(key, value);
        if (key === 'notesPath') {
            console.info(`[Settings] Notes path changed to: ${value}`);
            setupFileWatcher();
            reindexAllNotes();
        }
    });
    ipcMain.handle('settings:select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0];
    });
    ipcMain.handle('shell:open-path', async (event, pathStr) => {
        const target = pathStr || getNotesDir();
        await shell.openPath(target);
    });

    // --- 注册模型与AI IPC ---
    ipcMain.handle('models:list', modelManager.listLocalModels);
    ipcMain.handle('models:download', (event, { url, fileName }) => modelManager.downloadModel(mainWindow, url, fileName));
    ipcMain.handle('models:get-dir', modelManager.getModelsDir);
    ipcMain.handle('models:get-status', () => modelStatus);

    ipcMain.handle('llm:start-chat', (event, userPrompt, contextContent) => llmService.startChatStream(mainWindow, userPrompt, contextContent));
    ipcMain.handle('llm:generate-tags', async (event, prompt) => {
        try {
            const result = await llmService.generateCompletion(prompt);
            return { success: true, text: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    ipcMain.handle('vectors:search', (event, { queryText, traceId, excludeId }) => vectorService.searchSimilarNotes(queryText, traceId, excludeId));

    // --- 主题 IPC ---
    ipcMain.handle('theme:get-system', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    ipcMain.on('theme:set', (event, theme) => {
        const validThemes = new Set(['light', 'dark', 'system']);
        if (validThemes.has(theme)) nativeTheme.themeSource = theme;
    });

    await initializeAIServices();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (watcher) watcher.close();
    if (process.platform !== 'darwin') app.quit();
});