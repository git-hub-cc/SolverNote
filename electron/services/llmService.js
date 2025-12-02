// electron/services/llmService.js

// 引入 Node.js 内置的 path 模块，用于处理文件路径
const path = require('path');

// =======================================================================
// 单例模式状态管理
// 为了节省资源，整个应用生命周期中只保留一个 LlamaCpp 实例和一个加载的模型。
// =======================================================================

let llama = null; // LlamaCpp 引擎的核心实例
let model = null; // 当前加载的模型对象
let currentModelPath = ''; // 当前加载模型的路径，用于判断是否需要重新加载

/**
 * [内部辅助函数] 动态导入并初始化全局 LlamaCpp 实例。
 * 使用动态 import() 是因为 node-llama-cpp 是一个 ESM 模块。
 */
async function _initializeLlama() {
    // 如果已经初始化，则直接返回
    if (llama) {
        return;
    }
    try {
        console.log('[LLM 服务] 正在导入并初始化 LlamaCpp 核心...');
        const { getLlama } = await import('node-llama-cpp');
        llama = await getLlama();
        console.log('[LLM 服务] LlamaCpp 核心已初始化。');
    } catch (error) {
        console.error('[LLM 服务] 初始化 LlamaCpp 失败:', error);
        throw new Error('初始化 AI 引擎 (node-llama-cpp) 失败。');
    }
}

/**
 * 加载指定的 GGUF 格式聊天模型。
 * @param {string} modelPath - 模型文件的绝对路径。
 * @returns {Promise<boolean>} - 加载成功返回 true，否则返回 false 或抛出错误。
 */
async function loadModel(modelPath) {
    if (!modelPath || typeof modelPath !== 'string') {
        console.error('[LLM 服务] 加载失败：无效的模型路径。');
        return false;
    }

    // 如果请求加载的模型已经是当前加载的模型，则无需任何操作
    if (model && currentModelPath === modelPath) {
        console.log('[LLM 服务] 模型已加载，无需重复操作。');
        return true;
    }

    try {
        // 确保 LlamaCpp 引擎已初始化
        await _initializeLlama();

        // 如果已有旧模型加载，先释放其占用的资源
        if (model) {
            console.log(`[LLM 服务] 正在释放旧模型: ${path.basename(currentModelPath)}`);
            await model.dispose();
            model = null;
            currentModelPath = '';
        }

        console.log(`[LLM 服务] 正在加载模型: ${path.basename(modelPath)}`);
        model = await llama.loadModel({ modelPath });
        currentModelPath = modelPath;
        console.log('[LLM 服务] 模型加载成功。');
        return true;
    } catch (error) {
        console.error(`[LLM 服务] 加载模型 '${path.basename(modelPath)}' 失败:`, error);
        model = null;
        currentModelPath = '';
        throw error; // 将错误向上抛出，以便上层可以捕获
    }
}

/**
 * [新增] 生成一次性文本补全 (非流式)。
 * 用于后台任务，如生成标签、总结标题等，这些场景不需要“打字机”效果。
 *
 * @param {string} prompt - 完整的提示词。
 * @returns {Promise<string>} - 模型生成的完整文本。
 */
async function generateCompletion(prompt) {
    if (!model) {
        throw new Error('模型未加载');
    }

    let sessionContext = null;
    try {
        // 动态导入 LlamaChatSession
        const { LlamaChatSession } = await import('node-llama-cpp');
        // 为本次任务创建一个独立的会话上下文
        sessionContext = await model.createContext();
        const session = new LlamaChatSession({
            contextSequence: sessionContext.getSequence()
        });

        console.log('[LLM 服务] 正在生成文本补全...');
        // 直接调用 prompt 并等待 Promise 解析，它会返回完整的生成结果
        return await session.prompt(prompt, {
            maxTokens: 200,     // 限制最大 token 数，生成标签等任务不需要太长
            temperature: 0.3    // 较低的温度值，使输出更具确定性和相关性
        });
    } catch (error) {
        console.error('[LLM 服务] 文本补全失败:', error);
        throw error;
    } finally {
        // 确保会话上下文被正确释放，避免内存泄漏
        if (sessionContext) {
            await sessionContext.dispose();
        }
    }
}

/**
 * 启动一个流式的聊天会话，并将生成的 token 实时发送到渲染进程。
 * @param {BrowserWindow} win - 主窗口对象，用于发送 IPC 消息。
 * @param {string} userPrompt - 用户的输入问题。
 * @param {string} [contextContent] - (可选) 相关的上下文内容，如当前笔记。
 */
async function startChatStream(win, userPrompt, contextContent) {
    if (!model) {
        const errorMsg = '聊天模型未加载。请在“设置”中下载它。';
        console.error(`[LLM 服务] 聊天失败: ${errorMsg}`);
        win.webContents.send('llm-stream-error', errorMsg);
        win.webContents.send('llm-stream-end');
        return;
    }

    let sessionContext = null;

    try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        sessionContext = await model.createContext();
        const session = new LlamaChatSession({
            contextSequence: sessionContext.getSequence()
        });

        // 根据是否存在上下文，构建最终的提示词
        let finalPrompt;
        if (contextContent && contextContent.trim()) {
            finalPrompt = `你是一个名为 Solver 的 AI 助手。请根据下方提供的用户笔记上下文来回答用户的问题。如果问题与上下文无关，请正常回答。

--- 上下文 ---
${contextContent}
--- 结束上下文 ---

用户问题: ${userPrompt}`.trim();
        } else {
            finalPrompt = userPrompt;
        }

        console.log(`[LLM 服务] 正在开始聊天流...`);

        await session.prompt(finalPrompt, {
            // 关键：定义 onTextChunk 回调，每当模型生成一个 token 时，此函数就会被调用
            onTextChunk: (token) => {
                if (win && !win.isDestroyed()) {
                    // 通过 IPC 将 token 发送到渲染进程
                    win.webContents.send('llm-token-stream', token);
                }
            }
        });

    } catch (error) {
        console.error('[LLM 服务] 聊天出错:', error);
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-error', `AI 错误: ${error.message}`);
        }
    } finally {
        // 确保会话上下文被释放
        if (sessionContext) {
            await sessionContext.dispose();
        }
        // 无论成功与否，都发送结束信号，以通知前端停止等待
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-end');
        }
        console.log('[LLM 服务] 聊天流已结束。');
    }
}

// 导出公共接口
module.exports = {
    loadModel,
    startChatStream,
    generateCompletion // [新增]
};