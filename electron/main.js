// electron/main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs-extra');
const log = require('electron-log'); // 引入日志模块

// --- 日志配置 ---
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs/main.log');
log.level = process.env.SOLVER_LOG_LEVEL || (app.isPackaged ? 'info' : 'debug');

// 重定向 console 到文件日志
console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;
console.debug = log.debug;

// 引入本地模块
const {
    handleLoadNotes,
    handleSaveNote,
    handleSearchNotes,
    handleDeleteNote
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

// --- 辅助函数 ---
function getNotesDir() {
    const noteDir = path.join(process.cwd(), 'notes');
    fs.ensureDirSync(noteDir);
    return noteDir;
}

// --- 核心业务函数 (保持不变) ---
async function reindexAllNotes() {
    console.info('[AI] 开始对所有现有笔记进行全量重新索引...');
    try {
        const allNotes = await handleLoadNotes();
        if (allNotes.length === 0) {
            console.info('[AI] 未发现现有笔记，跳过索引。');
            return;
        }
        let indexedCount = 0;
        for (const note of allNotes) {
            await vectorService.indexNote(note.id, note.rawContent);
            indexedCount++;
        }
        console.info(`[AI] 全量索引完成，共处理 ${indexedCount} 篇笔记。`);
    } catch (error) {
        console.error('[AI] 全量索引过程中发生错误:', error);
    }
}

function setupFileWatcher() {
    const notesDir = getNotesDir();
    watcher = chokidar.watch(path.join(notesDir, '*.md'), {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
    });

    console.info(`正在监听笔记目录: ${notesDir}`);

    watcher.on('add', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = path.basename(filePath);
        console.info(`检测到新文件: ${noteId}，准备索引...`);
        await vectorService.indexNote(noteId, rawContent);
    });
    watcher.on('change', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = path.basename(filePath);
        console.info(`检测到文件变更: ${noteId}，准备重新索引...`);
        await vectorService.indexNote(noteId, rawContent);
    });
    watcher.on('unlink', (filePath) => {
        const noteId = path.basename(filePath);
        console.info(`检测到文件删除: ${noteId}，准备删除索引...`);
        vectorService.deleteNoteIndex(noteId);
    });
}

async function initializeAIServices() {
    const modelsDir = modelManager.getModelsDir();

    // 初始化聊天模型
    const chatModelPath = path.join(modelsDir, CHAT_MODEL_FILENAME);
    modelStatus.chat = 'Loading';
    console.info(`[AI] 正在检查聊天模型: ${chatModelPath}`);
    if (await fs.pathExists(chatModelPath)) {
        try {
            const success = await llmService.loadModel(chatModelPath);
            if (success) {
                modelStatus.chat = 'Ready';
                console.info('[AI] 聊天模型已准备就绪。');
            } else {
                throw new Error('llmService.loadModel返回false');
            }
        } catch (error) {
            modelStatus.chat = 'Error';
            console.error('[AI] 加载聊天模型失败:', error);
        }
    } else {
        modelStatus.chat = 'Not Found';
        console.warn(`[AI] 未找到聊天模型: ${CHAT_MODEL_FILENAME}。请在设置中下载。`);
    }

    // 初始化嵌入模型
    const embeddingModelPath = path.join(modelsDir, EMBEDDING_MODEL_FILENAME);
    modelStatus.embedding = 'Loading';
    console.info(`[AI] 正在检查嵌入模型: ${embeddingModelPath}`);
    if (await fs.pathExists(embeddingModelPath)) {
        try {
            const success = await vectorService.initialize(embeddingModelPath);
            if (success) {
                modelStatus.embedding = 'Ready';
                console.info('[AI] 嵌入模型和向量服务已准备就绪。');
                await reindexAllNotes(); // 启动时重建索引以确保数据最新
                setupFileWatcher();     // 启动文件监听
            } else {
                throw new Error('vectorService.initialize返回false');
            }
        } catch (error) {
            modelStatus.embedding = 'Error';
            console.error('[AI] 初始化向量服务失败:', error);
        }
    } else {
        modelStatus.embedding = 'Not Found';
        console.warn(`[AI] 未找到嵌入模型: ${EMBEDDING_MODEL_FILENAME}。语义搜索功能将不可用，请在设置中下载。`);
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

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// --- Electron 应用生命周期 ---
app.whenReady().then(async () => {
    console.info('================ 应用启动 ================');
    console.info(`日志级别设置为: ${log.level}`);

    // --- 注册 IPC 处理程序 ---
    ipcMain.handle('notes:load', handleLoadNotes);
    ipcMain.handle('notes:save', handleSaveNote);
    ipcMain.handle('notes:search', handleSearchNotes);
    ipcMain.handle('notes:delete', handleDeleteNote);

    ipcMain.handle('models:list', modelManager.listLocalModels);
    ipcMain.handle('models:download', (event, { url, fileName }) => {
        return modelManager.downloadModel(mainWindow, url, fileName);
    });
    ipcMain.handle('models:get-dir', modelManager.getModelsDir);
    ipcMain.handle('models:get-status', () => modelStatus);

    ipcMain.handle('llm:start-chat', (event, userPrompt, contextContent) => {
        llmService.startChatStream(mainWindow, userPrompt, contextContent);
    });

    /**
     * [核心修改] 向量搜索 IPC 处理器
     * 接收 excludeId 参数，用于传递给服务层进行过滤
     */
    ipcMain.handle('vectors:search', (event, { queryText, traceId, excludeId }) => {
        console.info(`[IPC][${traceId}] 收到向量搜索请求。`, {
            payload: { queryText: queryText?.substring(0, 50), excludeId }
        });

        // 调用服务层逻辑
        return vectorService.searchSimilarNotes(queryText, traceId, excludeId);
    });

    // 初始化服务并创建窗口
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