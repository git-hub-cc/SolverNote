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

// --- 初始化 Store (持久化配置) ---
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

// --- 引入本地模块 ---
const {
    handleLoadNotes,
    handleSaveNote,
    handleDeleteNote,
    handleGetFileTree,
    handleCreateFolder,
    handleRenamePath,
    handleMovePath
} = require('./handlers');
const modelManager = require('./services/modelManager');
const llmService = require('./services/llmService');
const vectorService = require('./services/vectorService');

// 定义模型文件名常量
const CHAT_MODEL_FILENAME = 'qwen1_5-0_5b-chat-q4_k_m.gguf';
const EMBEDDING_MODEL_FILENAME = 'bge-small-en-v1.5.Q8_0.gguf';

// 全局状态：追踪AI模型加载情况
const modelStatus = {
    chat: '未初始化',
    embedding: '未初始化'
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

// --- 核心业务函数 (保持不变) ---
async function reindexAllNotes() {
    console.info('[AI] 开始全量重新索引...');
    try {
        const allNotes = await handleLoadNotes();
        if (allNotes.length === 0) {
            console.info('[AI] 没有需要索引的笔记。');
            return;
        }
        let indexedCount = 0;
        for (const note of allNotes) {
            await vectorService.indexNote(note.id, note.rawContent);
            indexedCount++;
        }
        console.info(`[AI] 重新索引完成。共处理 ${indexedCount} 篇笔记。`);
    } catch (error) {
        console.error('[AI] 重新索引过程中出错:', error);
    }
}
function setupFileWatcher() {
    if (watcher) {
        watcher.close().then(() => console.info('旧的文件监视器已关闭。'));
    }
    const notesDir = getNotesDir();
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
    console.info(`正在监视目录: ${notesDir}`);
    const getRelativeId = (filePath) => path.relative(notesDir, filePath).split(path.sep).join('/');
    const notifyFrontend = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notes:updated');
        }
    };
    watcher.on('add', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = getRelativeId(filePath);
        console.info(`检测到新文件: ${noteId}, 正在索引...`);
        notifyFrontend();
        await vectorService.indexNote(noteId, rawContent);
    });
    watcher.on('change', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = getRelativeId(filePath);
        console.info(`文件变更: ${noteId}, 正在重新索引...`);
        notifyFrontend();
        await vectorService.indexNote(noteId, rawContent);
    });
    watcher.on('unlink', (filePath) => {
        const noteId = getRelativeId(filePath);
        console.info(`文件已删除: ${noteId}, 正在移除索引...`);
        notifyFrontend();
        vectorService.deleteNoteIndex(noteId);
    });
}
async function initializeAIServices() {
    const modelsDir = modelManager.getModelsDir();
    const chatModelPath = path.join(modelsDir, CHAT_MODEL_FILENAME);
    modelStatus.chat = '加载中';
    if (await fs.pathExists(chatModelPath)) {
        try {
            const success = await llmService.loadModel(chatModelPath);
            modelStatus.chat = success ? '就绪' : '错误';
            if (success) console.info('[AI] 聊天模型已就绪。');
        } catch (error) {
            modelStatus.chat = '错误';
            console.error('[AI] 加载聊天模型失败:', error);
        }
    } else {
        modelStatus.chat = '未找到';
    }
    const embeddingModelPath = path.join(modelsDir, EMBEDDING_MODEL_FILENAME);
    modelStatus.embedding = '加载中';
    if (await fs.pathExists(embeddingModelPath)) {
        try {
            const success = await vectorService.initialize(embeddingModelPath);
            if (success) {
                modelStatus.embedding = '就绪';
                console.info('[AI] 向量服务已就绪。');
                await reindexAllNotes();
                setupFileWatcher();
            } else {
                throw new Error('vectorService.initialize 返回 false');
            }
        } catch (error) {
            modelStatus.embedding = '错误';
            console.error('[AI] 初始化向量服务失败:', error);
        }
    } else {
        modelStatus.embedding = '未找到';
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

    // [核心修改] 移除此监听器。
    // 由于不再有“系统”主题，渲染进程成为主题的唯一来源，
    // 主进程无需再向其推送系统主题变化。
    // nativeTheme.on('updated', () => { ... });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// --- 应用生命周期事件 ---

app.whenReady().then(async () => {
    console.info('================ 应用已启动 ================');
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
    }

    // --- 注册 IPC 通道 ---
    // 基础笔记操作
    ipcMain.handle('notes:load', handleLoadNotes);
    ipcMain.handle('notes:save', handleSaveNote);
    ipcMain.handle('notes:delete', handleDeleteNote);
    // 文件系统操作
    ipcMain.handle('fs:get-tree', handleGetFileTree);
    ipcMain.handle('fs:create-folder', handleCreateFolder);
    ipcMain.handle('fs:rename', handleRenamePath);
    ipcMain.handle('fs:move', handleMovePath);
    // 设置相关
    ipcMain.handle('settings:get', () => store.store);
    ipcMain.handle('settings:set', (event, key, value) => {
        store.set(key, value);
        if (key === 'notesPath') {
            console.info(`[设置] 笔记路径已更改为: ${value}`);
            setupFileWatcher();
            reindexAllNotes();
        }
    });
    ipcMain.handle('settings:select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
        return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0];
    });
    ipcMain.handle('shell:open-path', async (event, pathStr) => {
        await shell.openPath(pathStr || getNotesDir());
    });
    // AI 与模型相关
    ipcMain.handle('models:list', modelManager.listLocalModels);
    ipcMain.handle('models:download', (event, { url, fileName }) => modelManager.downloadModel(mainWindow, url, fileName));
    ipcMain.handle('models:get-dir', modelManager.getModelsDir);
    ipcMain.handle('models:get-status', () => modelStatus);
    // LLM 功能
    ipcMain.handle('llm:start-chat', (event, userPrompt, contextContent) => llmService.startChatStream(mainWindow, userPrompt, contextContent));
    ipcMain.handle('llm:generate-tags', async (event, prompt) => {
        try {
            return { success: true, text: await llmService.generateCompletion(prompt) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
    ipcMain.handle('vectors:search', (event, { queryText, traceId, excludeId }) => vectorService.searchSimilarNotes(queryText, traceId, excludeId));

    // --- 主题相关 (核心修改区域) ---

    // [核心修改] 移除获取系统主题的句柄，因为 uiStore 不再需要此信息。
    // ipcMain.handle('theme:get-system', ...);

    // [核心修改] 更新 IPC 监听器，现在只接受 'light' 或 'dark'。
    ipcMain.on('theme:set', (event, theme) => {
        // 鲁棒性检查：确保只接受 'light' 或 'dark'，防止无效值。
        const validThemes = new Set(['light', 'dark']);
        if (validThemes.has(theme)) {
            // 直接将收到的主题值设置给 nativeTheme，Electron 会处理原生窗口和控件的样式。
            nativeTheme.themeSource = theme;
        }
    });

    // --- 启动流程 ---
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