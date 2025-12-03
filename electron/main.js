// electron/main.js

const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs-extra');
const log = require('electron-log');
const Store = require('electron-store');

// --- 日志配置 (Logging Configuration) ---
// [日志] 配置日志格式，包含时间戳、级别和消息文本
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
// [日志] 指定日志文件存储在应用的用户数据目录中，便于用户查找和上报问题
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs/main.log');
// [日志] 设置日志级别。在开发环境中为 'debug'，打包后为 'info'，或可通过环境变量覆盖
log.level = process.env.SOLVER_LOG_LEVEL || (app.isPackaged ? 'info' : 'debug');
// [日志] [核心] 重定向 Node.js 的 console 输出到 electron-log。
// 这样一来，主进程中所有模块（包括子模块）使用的 console.log/error 等都会被记录到文件中。
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
    chat: 'Uninitialized',
    embedding: 'Uninitialized'
};

const isDev = !app.isPackaged;
let mainWindow = null;
let watcher = null;

// --- 辅助函数：获取当前配置的笔记目录 ---
function getNotesDir() {
    const configuredPath = store.get('notesPath');
    fs.ensureDirSync(configuredPath); // 确保目录存在
    return configuredPath;
}

// --- 核心业务函数 ---
async function reindexAllNotes() {
    console.info('[AI] 开始全量重新索引...');
    try {
        const allNotes = await handleLoadNotes();
        if (allNotes.length === 0) {
            console.info('[AI] 笔记库为空，无需索引。');
            return;
        }
        let indexedCount = 0;
        for (const note of allNotes) {
            await vectorService.indexNote(note.id, note.rawContent);
            indexedCount++;
        }
        console.info(`[AI] 全量重新索引完成。共处理 ${indexedCount} 篇笔记。`);
    } catch (error) {
        console.error('[AI] 全量重新索引过程中发生严重错误:', error);
    }
}

function setupFileWatcher() {
    if (watcher) {
        watcher.close().then(() => console.info('[FS] 旧的文件监视器已成功关闭。'));
    }
    const notesDir = getNotesDir();
    console.info(`[FS] 正在启动文件监视器，目标目录: ${notesDir}`);
    watcher = chokidar.watch(path.join(notesDir, '**/*.md'), {
        ignored: /(^|[\/\\])\../, // 忽略隐藏文件
        persistent: true,
        ignoreInitial: true, // 忽略初始扫描事件
        depth: 99,
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100
        }
    });

    const getRelativeId = (filePath) => path.relative(notesDir, filePath).split(path.sep).join('/');

    const notifyFrontend = (eventName, noteId) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            console.info(`[FS] 事件 '${eventName}' 触发，通知渲染进程更新UI。Note ID: ${noteId}`);
            mainWindow.webContents.send('notes:updated');
        } else {
            console.warn(`[FS] 事件 '${eventName}' 触发，但主窗口不存在，无法通知渲染进程。`);
        }
    };

    watcher.on('add', async (filePath) => {
        const noteId = getRelativeId(filePath);
        console.info(`[FS] 检测到新文件: ${noteId}`);
        notifyFrontend('add', noteId);
        const rawContent = await fs.readFile(filePath, 'utf-8');
        await vectorService.indexNote(noteId, rawContent);
    });
    watcher.on('change', async (filePath) => {
        const noteId = getRelativeId(filePath);
        console.info(`[FS] 文件内容变更: ${noteId}`);
        notifyFrontend('change', noteId);
        const rawContent = await fs.readFile(filePath, 'utf-8');
        await vectorService.indexNote(noteId, rawContent); // 重新索引
    });
    watcher.on('unlink', (filePath) => {
        const noteId = getRelativeId(filePath);
        console.info(`[FS] 文件已删除: ${noteId}`);
        notifyFrontend('unlink', noteId);
        vectorService.deleteNoteIndex(noteId); // 从向量数据库中删除
    });
    watcher.on('error', error => console.error(`[FS] 文件监视器发生错误: ${error}`));
}

async function initializeAIServices() {
    console.info('[AI] 开始初始化 AI 服务...');
    const modelsDir = modelManager.getModelsDir();

    // --- 处理聊天模型 ---
    const chatModelPath = path.join(modelsDir, CHAT_MODEL_FILENAME);
    modelStatus.chat = 'Loading';
    if (await fs.pathExists(chatModelPath)) {
        try {
            const success = await llmService.loadModel(chatModelPath);
            modelStatus.chat = success ? 'Ready' : 'Error';
            console.info(`[AI] 聊天模型加载完成，状态: ${modelStatus.chat}`);
        } catch (error) {
            modelStatus.chat = 'Error';
            console.error('[AI] 加载聊天模型时发生致命错误:', error);
        }
    } else {
        modelStatus.chat = 'Not Found';
        console.warn(`[AI] 聊天模型未找到，路径: ${chatModelPath}`);
    }

    // --- 处理嵌入模型 ---
    const embeddingModelPath = path.join(modelsDir, EMBEDDING_MODEL_FILENAME);
    modelStatus.embedding = 'Loading';
    if (await fs.pathExists(embeddingModelPath)) {
        try {
            const success = await vectorService.initialize(embeddingModelPath);
            modelStatus.embedding = success ? 'Ready' : 'Error';
            console.info(`[AI] 向量服务初始化完成，状态: ${modelStatus.embedding}`);
            if (success) {
                // 仅在向量服务成功启动后，才开始索引和文件监视
                await reindexAllNotes();
                setupFileWatcher();
            }
        } catch (error) {
            modelStatus.embedding = 'Error';
            console.error('[AI] 初始化向量服务时发生致命错误:', error);
        }
    } else {
        modelStatus.embedding = 'Not Found';
        console.warn(`[AI] 嵌入模型未找到，路径: ${embeddingModelPath}`);
    }
    console.info('[AI] AI 服务初始化流程结束。');
}

function createWindow() {
    console.info('[Window] 正在创建主窗口...');
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

    if (isDev) {
        const url = 'http://localhost:5173';
        console.info(`[Window] 开发模式，正在加载 URL: ${url}`);
        mainWindow.loadURL(url);
        mainWindow.webContents.openDevTools();
    } else {
        const filePath = path.join(__dirname, '../dist/index.html');
        console.info(`[Window] 生产模式，正在加载文件: ${filePath}`);
        mainWindow.loadFile(filePath);
    }
    console.info('[Window] 主窗口创建成功。');
}

// --- 应用生命周期事件 ---

app.whenReady().then(async () => {
    console.info('================ 应用已就绪 (App Ready) ================');
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null); // Windows 和 Linux 移除菜单栏
    }

    console.info('[IPC] 正在注册所有 IPC 通道...');
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
        console.info(`[Settings] 收到设置更新请求: key=${key}, value=${value}`);
        store.set(key, value);
        if (key === 'notesPath') {
            console.info(`[Settings] 笔记路径已更改，将重新初始化文件监视和索引。`);
            setupFileWatcher();
            reindexAllNotes();
        }
    });
    ipcMain.handle('settings:select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
        return (result.canceled || result.filePaths.length === 0) ? null : result.filePaths[0];
    });
    ipcMain.handle('shell:open-path', async (event, pathStr) => {
        const pathToOpen = pathStr || getNotesDir();
        console.info(`[Shell] 正在使用系统默认方式打开路径: ${pathToOpen}`);
        await shell.openPath(pathToOpen);
    });
    // AI 与模型相关
    ipcMain.handle('models:list', modelManager.listLocalModels);
    ipcMain.handle('models:download', (event, { url, fileName }) => modelManager.downloadModel(mainWindow, url, fileName));
    ipcMain.handle('models:get-dir', modelManager.getModelsDir);
    ipcMain.handle('models:get-status', () => modelStatus);
    // LLM 功能
    ipcMain.handle('llm:start-chat', (event, userPrompt, contextContent) => llmService.startChatStream(mainWindow, userPrompt, contextContent));
    ipcMain.handle('llm:generate-tags', llmService.generateCompletion); // 直接转发
    // 向量搜索
    ipcMain.handle('vectors:search', (event, { queryText, traceId, excludeId }) => vectorService.searchSimilarNotes(queryText, traceId, excludeId));
    // 主题
    ipcMain.on('theme:set', (event, theme) => {
        console.info(`[Theme] 收到渲染进程的主题设置请求: ${theme}`);
        if (['light', 'dark'].includes(theme)) {
            nativeTheme.themeSource = theme;
        }
    });
    console.info('[IPC] 所有 IPC 通道注册完成。');

    // --- 启动流程 ---
    await initializeAIServices();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            console.info('[App] 应用被激活，但无窗口存在，重新创建主窗口。');
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    console.info('[App] 所有窗口已关闭。');
    if (watcher) {
        watcher.close().then(() => console.info('[FS] 文件监视器已在应用退出时关闭。'));
    }
    if (process.platform !== 'darwin') {
        console.info('[App] 非 macOS 平台，正在退出应用...');
        app.quit();
    }
});