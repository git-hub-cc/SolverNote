// electron/services/llmService.js

const path = require('path');
// [日志] 虽然 main.js 重定向了 console，但为保持模块独立性，在此明确引入
const log = require('electron-log');

// 单例模式状态管理
let llama = null;
let model = null;
let currentModelPath = '';

/**
 * [内部辅助函数] 动态导入并初始化全局 LlamaCpp 实例。
 */
async function _initializeLlama() {
    if (llama) return;
    try {
        log.info('[LLM Service] 正在动态导入并初始化 LlamaCpp 核心...');
        // 动态 import() 是因为 node-llama-cpp 是 ESM 模块
        const { getLlama } = await import('node-llama-cpp');
        llama = await getLlama();
        log.info('[LLM Service] LlamaCpp 核心已成功初始化。');
    } catch (error) {
        log.error('[LLM Service] 初始化 LlamaCpp 核心失败:', error);
        throw new Error('初始化 AI 引擎 (node-llama-cpp) 失败。');
    }
}

/**
 * 加载指定的 GGUF 格式聊天模型。
 * @param {string} modelPath - 模型文件的绝对路径。
 * @returns {Promise<boolean>} - 加载成功返回 true。
 */
async function loadModel(modelPath) {
    if (!modelPath || typeof modelPath !== 'string') {
        log.error(`[LLM Service] 加载模型失败：提供的路径无效。路径: ${modelPath}`);
        return false;
    }

    if (model && currentModelPath === modelPath) {
        log.info('[LLM Service] 模型已加载，无需重复操作。');
        return true;
    }

    try {
        await _initializeLlama();

        if (model) {
            log.info(`[LLM Service] 正在释放旧模型: ${path.basename(currentModelPath)}`);
            await model.dispose();
            model = null;
            currentModelPath = '';
        }

        log.info(`[LLM Service] 开始加载新模型: ${path.basename(modelPath)}`);
        model = await llama.loadModel({ modelPath });
        currentModelPath = modelPath;
        log.info('[LLM Service] 新模型加载成功。');
        return true;
    } catch (error) {
        log.error(`[LLM Service] 加载模型 '${path.basename(modelPath)}' 时发生严重错误:`, error);
        model = null;
        currentModelPath = '';
        throw error; // 将错误向上抛出，以便上层能捕获并更新状态
    }
}

/**
 * 生成一次性文本补全 (非流式)。
 * @param {string} prompt - 完整的提示词。
 * @returns {Promise<string>} - 模型生成的完整文本。
 */
async function generateCompletion(prompt) {
    if (!model) {
        log.error('[LLM Service] generateCompletion 失败：模型未加载。');
        throw new Error('模型未加载');
    }

    log.info('[LLM Service] 正在执行一次性文本生成任务...');
    log.debug(`[LLM Service] generateCompletion Prompt (前100字符): ${prompt.substring(0, 100)}...`);

    let sessionContext = null;
    try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        sessionContext = await model.createContext();
        const session = new LlamaChatSession({ contextSequence: sessionContext.getSequence() });

        const result = await session.prompt(prompt, {
            maxTokens: 200,
            temperature: 0.3
        });

        log.info(`[LLM Service] 文本生成成功。`);
        log.debug(`[LLM Service] generateCompletion Result: ${result}`);
        return result;
    } catch (error) {
        log.error('[LLM Service] 一次性文本生成失败:', error);
        throw error;
    } finally {
        if (sessionContext) {
            await sessionContext.dispose();
            log.debug('[LLM Service] generateCompletion 的会话上下文已释放。');
        }
    }
}

/**
 * 启动一个流式的聊天会话。
 * @param {BrowserWindow} win - 主窗口对象，用于发送 IPC 消息。
 * @param {string} userPrompt - 用户的输入问题。
 * @param {string} [contextContent] - (可选) 相关的上下文内容。
 */
async function startChatStream(win, userPrompt, contextContent) {
    if (!model) {
        const errorMsg = '聊天模型未加载。请在“设置”中下载它。';
        log.error(`[LLM Service] startChatStream 失败: ${errorMsg}`);
        win.webContents.send('llm-stream-error', errorMsg);
        win.webContents.send('llm-stream-end');
        return;
    }

    log.info('[LLM Service] 开始处理流式聊天请求...');
    let sessionContext = null;

    try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        sessionContext = await model.createContext();
        const session = new LlamaChatSession({ contextSequence: sessionContext.getSequence() });

        let finalPrompt;
        if (contextContent && contextContent.trim()) {
            finalPrompt = `你是一个名为 Solver 的 AI 助手。请根据下方提供的用户笔记上下文来回答用户的问题。如果问题与上下文无关，请正常回答。\n\n--- 上下文 ---\n${contextContent}\n--- 结束上下文 ---\n\n用户问题: ${userPrompt}`.trim();
            log.info(`[LLM Service] 聊天请求包含上下文，长度: ${contextContent.length}`);
        } else {
            finalPrompt = userPrompt;
            log.info('[LLM Service] 聊天请求不包含上下文。');
        }
        log.debug(`[LLM Service] startChatStream Final Prompt (前100字符): ${finalPrompt.substring(0, 100)}...`);


        await session.prompt(finalPrompt, {
            onTextChunk: (token) => {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('llm-token-stream', token);
                }
            }
        });

    } catch (error) {
        log.error('[LLM Service] 流式聊天过程中发生错误:', error);
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-error', `AI 错误: ${error.message}`);
        }
    } finally {
        if (sessionContext) {
            await sessionContext.dispose();
            log.debug('[LLM Service] startChatStream 的会话上下文已释放。');
        }
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-end');
        }
        log.info('[LLM Service] 流式聊天请求处理结束。');
    }
}

module.exports = {
    loadModel,
    startChatStream,
    generateCompletion
};