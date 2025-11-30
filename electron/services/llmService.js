// electron/services/llmService.js

// --- 核心修复：引入 Node.js 内置的 path 模块 ---
// 这个模块是处理文件路径所必需的，例如用于从完整路径中提取文件名。
const path = require('path');

// =======================================================================
// 单例模式状态管理
// 这些变量用于在整个应用的生命周期内维护唯一的 LlamaCpp 实例和模型对象。
// =======================================================================

// 全局 LlamaCpp 引擎实例。延迟初始化，只在首次需要时加载。
let llama = null;
// 当前加载的聊天模型对象。
let model = null;
// 记录当前加载模型的路径，用于避免重复加载。
let currentModelPath = '';

/**
 * [内部辅助函数] 动态导入并初始化全局 LlamaCpp 实例。
 * 这是处理 ES Module (ESM) 依赖的关键，因为它允许在 CommonJS 环境中异步加载 ESM 库。
 *
 * @private
 * @returns {Promise<void>}
 * @throws {Error} 如果 LlamaCpp 核心引擎初始化失败。
 */
async function _initializeLlama() {
    // 如果实例已存在，则直接返回，实现单例模式。
    if (llama) {
        return;
    }
    try {
        console.log('[LLM Service] 正在动态导入并初始化 LlamaCpp 核心引擎...');
        // 使用动态 import() 语法来加载 'node-llama-cpp' 这个 ES Module。
        const { getLlama } = await import('node-llama-cpp');
        // getLlama() 是一个异步函数，它会下载或定位必要的二进制文件并准备好引擎。
        llama = await getLlama();
        console.log('[LLM Service] LlamaCpp 核心引擎初始化成功。');
    } catch (error) {
        console.error('[LLM Service] LlamaCpp 核心引擎初始化失败:', error);
        // 向上抛出一个更友好的错误信息。
        throw new Error('无法初始化核心 AI 引擎 (node-llama-cpp)。');
    }
}

/**
 * 加载指定的 GGUF 格式聊天模型。
 * 如果模型已加载，此函数会先释放旧模型再加载新模型。
 *
 * @param {string} modelPath - 模型文件的绝对路径。
 * @returns {Promise<boolean>} 如果加载成功则返回 true，否则返回 false。
 */
async function loadModel(modelPath) {
    // --- 输入验证 ---
    if (!modelPath || typeof modelPath !== 'string') {
        console.error('[LLM Service] 加载模型失败：提供了无效的模型路径。');
        return false;
    }

    // --- 避免重复加载 ---
    if (model && currentModelPath === modelPath) {
        console.log('[LLM Service] 聊天模型已是当前加载的模型，无需重复操作。');
        return true;
    }

    try {
        // --- 确保 LlamaCpp 引擎已初始化 ---
        await _initializeLlama();

        // --- 释放旧模型 ---
        if (model) {
            console.log(`[LLM Service] 检测到模型更换，正在释放旧模型: ${path.basename(currentModelPath)}`);
            await model.dispose();
            model = null; // 清理引用
            currentModelPath = '';
        }

        // --- 加载新模型 ---
        console.log(`[LLM Service] 开始加载聊天模型: ${path.basename(modelPath)}`);
        model = await llama.loadModel({ modelPath });
        currentModelPath = modelPath; // 更新当前模型路径
        console.log('[LLM Service] 聊天模型加载成功。');
        return true;
    } catch (error) {
        console.error(`[LLM Service] 加载聊天模型 '${path.basename(modelPath)}' 失败:`, error);
        // 在失败时重置状态，确保系统处于干净的状态。
        model = null;
        currentModelPath = '';
        // 将原始错误向上抛出，以便上层调用者（如 initializeAIServices）可以捕获并更新状态。
        throw error;
    }
}

/**
 * 启动一个流式的聊天会话，并将生成的 token 实时发送到渲染进程。
 *
 * @param {import('electron').BrowserWindow} win - 目标浏览器窗口，用于发送 IPC 消息。
 * @param {string} userPrompt - 用户输入的原始提问。
 * @param {string|null} contextContent - (可选) 从当前笔记中提取的上下文内容。
 */
async function startChatStream(win, userPrompt, contextContent) {
    // --- 前置条件检查 ---
    if (!model) {
        const errorMsg = '聊天模型尚未加载。请前往“设置”页面下载所需模型，然后重启应用。';
        console.error(`[LLM Service] 启动聊天失败: ${errorMsg}`);
        // 通过 IPC 将错误信息发送给前端 UI。
        win.webContents.send('llm-stream-error', errorMsg);
        win.webContents.send('llm-stream-end'); // 确保结束信号被发送，以便 UI 停止等待。
        return;
    }

    let sessionContext = null; // 用于持有 LlamaContext 引用，确保能被 finally 块访问

    try {
        // --- 动态导入会话模块 ---
        // 同样使用动态 import() 来获取 LlamaChatSession 类。
        const { LlamaChatSession } = await import('node-llama-cpp');

        // --- 创建会话上下文 ---
        // 这是与模型进行交互的底层对象。
        sessionContext = await model.createContext();
        const session = new LlamaChatSession({
            contextSequence: sessionContext.getSequence()
        });

        // --- 构建最终的 Prompt ---
        // 根据是否存在上下文，动态构建发送给模型的完整 prompt。
        let finalPrompt;
        if (contextContent && contextContent.trim()) {
            // 如果有上下文，则使用模板将其包裹起来。
            finalPrompt = `You are an AI assistant named Solver. Below is some context from a user's note. Use this context to answer the user's question. If the question is unrelated to the context, answer it normally.

--- CONTEXT ---
${contextContent}
--- END CONTEXT ---

USER QUESTION: ${userPrompt}`.trim();
        } else {
            // 如果没有上下文，直接使用用户的问题。
            finalPrompt = userPrompt;
        }

        console.log(`[LLM Service] 开始聊天流。Prompt (前100字符): "${finalPrompt.substring(0, 100)}..."`);

        // --- 执行流式推理 ---
        await session.prompt(finalPrompt, {
            // `onTextChunk` 是一个回调函数，每当模型生成一个新的文本片段（token）时，它就会被调用。
            onTextChunk: (token) => {
                // 通过 IPC 将 token 实时发送到前端。
                if (win && !win.isDestroyed()) {
                    win.webContents.send('llm-token-stream', token);
                }
            }
        });

    } catch (error) {
        console.error('[LLM Service] 聊天推理过程中发生严重错误:', error);
        // 将详细的错误信息发送给前端。
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-error', `AI 推理失败: ${error.message}`);
        }
    } finally {
        // --- 资源清理 ---
        // 无论成功还是失败，都必须确保释放 LlamaContext，防止内存泄漏。
        if (sessionContext) {
            await sessionContext.dispose();
        }
        // 发送流结束信号，通知前端停止显示加载状态。
        if (win && !win.isDestroyed()) {
            win.webContents.send('llm-stream-end');
        }
        console.log('[LLM Service] 聊天流处理结束，资源已清理。');
    }
}

// 导出公共接口
module.exports = {
    loadModel,
    startChatStream
};