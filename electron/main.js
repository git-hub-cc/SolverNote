const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs-extra');

// --- 引入原有处理器 ---
const {
    handleLoadNotes,
    handleSaveNote,
    handleSearchNotes, // 保留关键字搜索
    handleDeleteNote
} = require('./handlers');

// --- 引入新的 AI 服务 ---
const modelManager = require('./services/modelManager');
const llmService = require('./services/llmService');
const vectorService = require('./services/vectorService');

const isDev = !app.isPackaged;
let mainWindow = null;

// --- 辅助函数 ---
function getNotesDir() {
    const noteDir = path.join(process.cwd(), 'notes');
    fs.ensureDirSync(noteDir);
    return noteDir;
}

// --- 文件监听器 ---
let watcher = null;
function setupFileWatcher() {
    const notesDir = getNotesDir();
    watcher = chokidar.watch(path.join(notesDir, '*.md'), {
        ignored: /(^|[\/\\])\../, // 忽略隐藏文件
        persistent: true,
        ignoreInitial: true, // 忽略初始化的 'add' 事件
    });

    console.log(`正在监听笔记目录: ${notesDir}`);

    watcher
        .on('add', async (filePath) => {
            const content = await fs.readFile(filePath, 'utf-8');
            const noteId = path.basename(filePath);
            console.log(`检测到新文件: ${noteId}，准备索引...`);
            await vectorService.indexNote(noteId, content);
        })
        .on('change', async (filePath) => {
            const content = await fs.readFile(filePath, 'utf-8');
            const noteId = path.basename(filePath);
            console.log(`检测到文件变更: ${noteId}，准备重新索引...`);
            await vectorService.indexNote(noteId, content);
        })
        .on('unlink', (filePath) => {
            const noteId = path.basename(filePath);
            console.log(`检测到文件删除: ${noteId}，准备删除索引...`);
            vectorService.deleteNoteIndex(noteId);
        });
}


function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        // ... (其他窗口配置保持不变)
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js'),
            devTools: isDev
        }
    });

    // ... (其他窗口逻辑保持不变)
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(async () => {
    // --- 注册原有 IPC 处理程序 ---
    ipcMain.handle('notes:load', handleLoadNotes);
    ipcMain.handle('notes:save', handleSaveNote);
    ipcMain.handle('notes:search', handleSearchNotes);
    ipcMain.handle('notes:delete', handleDeleteNote);

    // --- 注册新的 AI 和模型管理 IPC 处理程序 ---

    // 模型管理
    ipcMain.handle('models:list', modelManager.listLocalModels);
    ipcMain.handle('models:download', (event, { url, fileName }) => {
        return modelManager.downloadModel(mainWindow, url, fileName);
    });
    ipcMain.handle('models:get-dir', modelManager.getModelsDir);

    // LLM 服务
    ipcMain.handle('llm:load-model', (event, modelPath) => {
        return llmService.loadModel(modelPath);
    });
    // 注意：流式API使用 handle 是为了启动，但数据通过 send 推送
    ipcMain.handle('llm:start-chat', (event, prompt) => {
        llmService.startChatStream(mainWindow, prompt);
    });

    // 向量服务
    ipcMain.handle('vectors:search', (event, queryText) => {
        return vectorService.searchSimilarNotes(queryText);
    });

    createWindow();

    // --- 初始化 AI 服务和文件监听 ---
    // 假设嵌入模型已下载或内置，这里硬编码路径作为示例
    // 在真实应用中，这个路径应该从用户设置中读取
    const embeddingModelPath = path.join(modelManager.getModelsDir(), 'bge-small-zh-v1.5-q4_k_m.gguf');
    if (await fs.pathExists(embeddingModelPath)) {
        await vectorService.initialize(embeddingModelPath);
        // 初始化成功后，开始监听文件
        setupFileWatcher();
    } else {
        console.warn('未找到嵌入模型，向量搜索功能将不可用。请先下载 BGE 模型。');
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (watcher) watcher.close(); // 关闭文件监听器
    if (process.platform !== 'darwin') app.quit();
});