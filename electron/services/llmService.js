// electron/services/llmService.js

// --- 核心修复：引入 Node.js 内置的 path 模块 ---
const path = require('path');

// =======================================================================
// 单例模式状态管理
// =======================================================================

let llama = null;
let model = null;
let currentModelPath = '';

/**
 * [内部辅助函数] 动态导入并初始化全局 LlamaCpp 实例。
 */
async function _initializeLlama() {
    if (llama) {
        return;
    }
    try {
        console.log('[LLM Service] Importing and initializing LlamaCpp core...');
        const { getLlama } = await import('node-llama-cpp');
        llama = await getLlama();
        console.log('[LLM Service] LlamaCpp core initialized.');
    } catch (error) {
        console.error('[LLM Service] Failed to initialize LlamaCpp:', error);
        throw new Error('Failed to initialize AI engine (node-llama-cpp).');
    }
}

/**
 * 加载指定的 GGUF 格式聊天模型。
 */
async function loadModel(modelPath) {
    if (!modelPath || typeof modelPath !== 'string') {
        console.error('[LLM Service] Load failed: Invalid model path.');
        return false;
    }

    if (model && currentModelPath === modelPath) {
        console.log('[LLM Service] Model already loaded.');
        return true;
    }

    try {
        await _initializeLlama();

        if (model) {
            console.log(`[LLM Service] Disposing old model: ${path.basename(currentModelPath)}`);
            await model.dispose();
            model = null;
            currentModelPath = '';
        }

        console.log(`[LLM Service] Loading model: ${path.basename(modelPath)}`);
        model = await llama.loadModel({ modelPath });
        currentModelPath = modelPath;
        console.log('[LLM Service] Model loaded successfully.');
        return true;
    } catch (error) {
        console.error(`[LLM Service] Failed to load model '${path.basename(modelPath)}':`, error);
        model = null;
        currentModelPath = '';
        throw error;
    }
}

/**
 * [新增] 生成一次性文本补全 (非流式)。
 * 用于生成 Tags、总结标题等无需打字机效果的后台任务。
 *
 * @param {string} prompt - 完整的提示词。
 * @returns {Promise<string>} - 模型生成的完整文本。
 */
async function generateCompletion(prompt) {
    if (!model) {
        throw new Error('Model not loaded');
    }

    let sessionContext = null;
    try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        sessionContext = await model.createContext();
        const session = new LlamaChatSession({
            contextSequence: sessionContext.getSequence()
        });

        console.log('[LLM Service] Generating completion...');
        // promptWithMeta 也可以，但在 LlamaChatSession 中直接用 prompt 比较方便
        // 我们不使用 onTextChunk，而是等待 Promise 解析返回完整文本
        const result = await session.prompt(prompt, {
            maxTokens: 200, // 限制 token 数，生成 Tag 不需要太长
            temperature: 0.3 // 较低的温度，让结果更确定、更相关
        });

        return result;
    } catch (error) {
        console.error('[LLM Service] Completion failed:', error);
        throw error;
    } finally {
        if (sessionContext) {
            await sessionContext.dispose();
        }
    }
}

/**
 * 启动一个流式的聊天会话。
 */
async function startChatStream(win, userPrompt, contextContent) {
    if (!model) {
        const errorMsg = 'Chat model not loaded. Please download it in Settings.';
        console.error(`[LLM Service] Chat failed: ${errorMsg}`);
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

        let finalPrompt;
        if (contextContent && contextContent.trim()) {
            finalPrompt = `You are an AI assistant named Solver. Below is some context from a user's note. Use this context to answer the user's question. If the question is unrelated to the context, answer it normally.

--- CONTEXT ---
${contextContent}
--- END CONTEXT ---

USER QUESTION: ${userPrompt}`.trim();
        } else {
            finalPrompt = userPrompt;
        }

        console.log(`[LLM Service] Starting chat stream...`);

        await session.prompt(finalPrompt, {
            onTextChunk: (token) => {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('llm-token-stream', token);
                }
            }
        });

    } catch (error) {
        console.error('[LLM Service] Chat error:', error);
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-error', `AI Error: ${error.message}`);
        }
    } finally {
        if (sessionContext) {
            await sessionContext.dispose();
        }
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-end');
        }
        console.log('[LLM Service] Chat stream ended.');
    }
}

// 导出公共接口
module.exports = {
    loadModel,
    startChatStream,
    generateCompletion // [新增]
};