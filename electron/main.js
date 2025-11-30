// electron/main.js

// 引入 Electron 核心模块
const { app, BrowserWindow, ipcMain } = require('electron');
// 引入 Node.js 的 path 模块，用于处理文件路径
const path = require('path');
// 引入 chokidar 模块，用于高效地监听文件系统变化
const chokidar = require('chokidar');
// 引入 fs-extra 模块，提供比原生 fs 更多功能的 API (如 ensureDirSync)
const fs = require('fs-extra');

// 引入本地模块，这些模块封装了不同功能的处理逻辑
// handlers.js: 负责处理笔记的 CRUD (创建、读取、更新、删除) 操作
const {
    handleLoadNotes,
    handleSaveNote,
    handleSearchNotes,
    handleDeleteNote
} = require('./handlers');

// modelManager.js: 负责管理 AI 模型的下载、存储和列出
const modelManager = require('./services/modelManager');
// llmService.js: 封装了与大语言模型 (LLM) 交互的逻辑，如加载模型、进行聊天
const llmService = require('./services/llmService');
// vectorService.js: 封装了向量数据库相关的操作，如初始化、索引、搜索
const vectorService = require('./services/vectorService');

// --- 核心修改：定义固定的模型文件名 ---
// 将模型文件名定义为常量，作为整个应用的“唯一事实来源”，便于统一管理和引用。
const CHAT_MODEL_FILENAME = 'qwen1_5-0_5b-chat-q4_k_m.gguf'; // 对话模型
const EMBEDDING_MODEL_FILENAME = 'bge-small-en-v1.5.Q8_0.gguf'; // 嵌入模型

// --- 核心修改：用于存储模型加载状态的全局变量 ---
// 这个对象将通过 IPC 通道暴露给前端，用于在设置页面实时展示 AI 服务的健康状况。
const modelStatus = {
    chat: 'Uninitialized',      // 对话模型状态: Uninitialized (未初始化), Loading (加载中), Ready (就绪), Not Found (未找到), Error (错误)
    embedding: 'Uninitialized'  // 嵌入模型状态: 同上
};

// 判断当前是否处于开发环境。app.isPackaged 表示应用是否已被打包。
const isDev = !app.isPackaged;
// 全局变量，持有主窗口对象的引用
let mainWindow = null;

/**
 * 获取并确保笔记存储目录存在
 * @returns {string} 笔记目录的绝对路径
 */
function getNotesDir() {
    // 将笔记目录设置在当前工作目录下
    const noteDir = path.join(process.cwd(), 'notes');
    // 确保目录存在，如果不存在则递归创建
    fs.ensureDirSync(noteDir);
    return noteDir;
}

// 全局变量，持有文件监听器对象的引用
let watcher = null;

/**
 * [新增] 重新索引所有已存在笔记的函数
 * 这是解决“智能关联”功能在应用启动时不生效问题的关键。
 */
async function reindexAllNotes() {
    console.log('[AI] 开始对所有现有笔记进行全量重新索引...');
    try {
        // 调用 handler 中的方法来加载所有笔记的完整信息（包括原始内容）
        const allNotes = await handleLoadNotes();
        if (allNotes.length === 0) {
            console.log('[AI] 未发现现有笔记，跳过索引。');
            return;
        }

        let indexedCount = 0;
        // 遍历每一篇笔记，并将其内容送入向量服务进行索引
        for (const note of allNotes) {
            // vectorService.indexNote 需要笔记的 ID 和原始 Markdown 内容
            await vectorService.indexNote(note.id, note.rawContent);
            indexedCount++;
        }
        console.log(`[AI] 全量索引完成，共处理 ${indexedCount} 篇笔记。`);
    } catch (error) {
        console.error('[AI] 全量索引过程中发生错误:', error);
    }
}


/**
 * 设置文件监听器，实时响应笔记目录的变化
 */
function setupFileWatcher() {
    const notesDir = getNotesDir();
    // 使用 chokidar 监听 notes 目录下的所有 .md 文件
    watcher = chokidar.watch(path.join(notesDir, '*.md'), {
        ignored: /(^|[\/\\])\../, // 忽略隐藏文件
        persistent: true,        // 持续监听
        ignoreInitial: true,     // 关键配置：忽略初始状态的文件，只响应启动后的变化
    });

    console.log(`正在监听笔记目录: ${notesDir}`);

    // 监听文件新增事件
    watcher.on('add', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = path.basename(filePath);
        console.log(`检测到新文件: ${noteId}，准备索引...`);
        // 对新笔记进行向量索引
        await vectorService.indexNote(noteId, rawContent);
    });

    // 监听文件内容变更事件
    watcher.on('change', async (filePath) => {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const noteId = path.basename(filePath);
        console.log(`检测到文件变更: ${noteId}，准备重新索引...`);
        // 对修改后的笔记进行重新索引
        await vectorService.indexNote(noteId, rawContent);
    });

    // 监听文件删除事件
    watcher.on('unlink', (filePath) => {
        const noteId = path.basename(filePath);
        console.log(`检测到文件删除: ${noteId}，准备删除索引...`);
        // 从向量数据库中删除对应笔记的索引
        vectorService.deleteNoteIndex(noteId);
    });
}

/**
 * 自动初始化 AI 服务的核心函数
 * 在应用启动时被调用，负责检查并加载必要的模型。
 */
async function initializeAIServices() {
    const modelsDir = modelManager.getModelsDir();

    // --- 1. 初始化聊天模型 ---
    const chatModelPath = path.join(modelsDir, CHAT_MODEL_FILENAME);
    modelStatus.chat = 'Loading'; // 更新状态为“加载中”
    console.log(`[AI] 正在检查聊天模型: ${chatModelPath}`);
    if (await fs.pathExists(chatModelPath)) { // 检查模型文件是否存在
        try {
            const success = await llmService.loadModel(chatModelPath);
            if (success) {
                modelStatus.chat = 'Ready'; // 更新状态为“就绪”
                console.log('[AI] 聊天模型已准备就绪。');
            } else {
                throw new Error('llmService.loadModel返回false');
            }
        } catch (error) {
            modelStatus.chat = 'Error'; // 更新状态为“错误”
            console.error('[AI] 加载聊天模型失败:', error);
        }
    } else {
        modelStatus.chat = 'Not Found'; // 更新状态为“未找到”
        console.warn(`[AI] 未找到聊天模型: ${CHAT_MODEL_FILENAME}。请在设置中下载。`);
    }

    // --- 2. 初始化嵌入模型和向量服务 ---
    const embeddingModelPath = path.join(modelsDir, EMBEDDING_MODEL_FILENAME);
    modelStatus.embedding = 'Loading'; // 更新状态为“加载中”
    console.log(`[AI] 正在检查嵌入模型: ${embeddingModelPath}`);
    if (await fs.pathExists(embeddingModelPath)) { // 检查模型文件是否存在
        try {
            const success = await vectorService.initialize(embeddingModelPath);
            if (success) {
                modelStatus.embedding = 'Ready'; // 更新状态为“就绪”
                console.log('[AI] 嵌入模型和向量服务已准备就绪。');

                // --- 核心修复：在这里调用全量索引 ---
                // 在向量服务准备好后，立即对所有已存在的笔记进行一次性索引。
                await reindexAllNotes();

                // 只有当向量服务成功启动后，才开始监听文件变化以进行增量更新
                setupFileWatcher();
            } else {
                throw new Error('vectorService.initialize返回false');
            }
        } catch (error) {
            modelStatus.embedding = 'Error'; // 更新状态为“错误”
            console.error('[AI] 初始化向量服务失败:', error);
        }
    } else {
        modelStatus.embedding = 'Not Found'; // 更新状态为“未找到”
        console.warn(`[AI] 未找到嵌入模型: ${EMBEDDING_MODEL_FILENAME}。语义搜索功能将不可用，请在设置中下载。`);
    }
}


/**
 * 创建并配置主浏览器窗口
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        webPreferences: {
            contextIsolation: true,       // 启用上下文隔离，增强安全性
            nodeIntegration: false,       // 禁用 Node.js 集成，增强安全性
            preload: path.join(__dirname, 'preload.js'), // 指定预加载脚本
            devTools: isDev               // 仅在开发模式下启用开发者工具
        }
    });

    if (isDev) {
        // 开发模式下，加载 Vite 开发服务器的 URL
        mainWindow.loadURL('http://localhost:5173');
        // 自动打开开发者工具
        mainWindow.webContents.openDevTools();
    } else {
        // 生产模式下，加载打包后 dist 目录中的 index.html 文件
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// 当 Electron 应用准备就绪时执行
app.whenReady().then(async () => {
    // --- 注册所有 IPC (进程间通信) 处理程序 ---
    // 这些 'handle' 方法响应来自渲染进程 (前端) 的 'invoke' 请求
    ipcMain.handle('notes:load', handleLoadNotes);
    ipcMain.handle('notes:save', handleSaveNote);
    ipcMain.handle('notes:search', handleSearchNotes);
    ipcMain.handle('notes:delete', handleDeleteNote);

    ipcMain.handle('models:list', modelManager.listLocalModels);
    ipcMain.handle('models:download', (event, { url, fileName }) => {
        // 下载模型时需要主窗口对象来发送进度更新
        return modelManager.downloadModel(mainWindow, url, fileName);
    });
    ipcMain.handle('models:get-dir', modelManager.getModelsDir);

    // 允许前端查询模型服务的当前状态
    ipcMain.handle('models:get-status', () => {
        return modelStatus;
    });

    // 接收来自前端的用户提问和可选的上下文内容
    ipcMain.handle('llm:start-chat', (event, userPrompt, contextContent) => {
        llmService.startChatStream(mainWindow, userPrompt, contextContent);
    });

    // 处理来自前端的向量搜索请求
    ipcMain.handle('vectors:search', (event, queryText) => {
        return vectorService.searchSimilarNotes(queryText);
    });

    // 在创建窗口之前，先异步初始化所有 AI 服务
    await initializeAIServices();

    // 创建主窗口
    createWindow();

    // macOS 特有：当点击 dock 图标且没有窗口时，重新创建一个窗口
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// 当所有窗口都关闭时执行
app.on('window-all-closed', () => {
    // 关闭文件监听器，释放资源
    if (watcher) watcher.close();
    // 在非 macOS 平台，关闭所有窗口通常意味着退出应用
    if (process.platform !== 'darwin') app.quit();
});