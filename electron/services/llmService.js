// [修改] 删除了顶部的 const { ... } = require("node-llama-cpp");
const path = require('path');

// 单例模式，确保全局只有一个模型实例和会话
let model = null;
let session = null;
let currentModelPath = '';

/**
 * 加载指定的聊天模型
 * @param {string} modelPath - GGUF 模型文件的完整路径
 * @returns {Promise<boolean>} 加载是否成功
 */
async function loadModel(modelPath) {
    // 如果请求加载的模型与当前已加载的模型相同，则无需操作
    if (model && currentModelPath === modelPath) {
        console.log('模型已加载，无需重复加载。');
        return true;
    }

    // [修改] 动态导入 ESM 模块
    const { LlamaModel } = await import("node-llama-cpp");

    try {
        // 如果已有模型，先释放资源
        if (model) {
            console.log('正在释放旧模型...');
            await model.dispose();
            model = null;
            session = null;
            currentModelPath = '';
        }

        console.log(`开始加载模型: ${modelPath}`);
        // node-llama-cpp 的模型参数，根据需要调整
        model = new LlamaModel({ modelPath });
        currentModelPath = modelPath;
        console.log('模型加载成功。');
        return true;
    } catch (error) {
        console.error('加载 LLM 模型失败:', error);
        model = null;
        currentModelPath = '';
        return false;
    }
}

/**
 * 开始一个流式聊天会话
 * @param {BrowserWindow} win - 用于发送 IPC 消息的窗口对象
 * @param {string} prompt - 用户的提问
 */
async function startChatStream(win, prompt) {
    if (!model) {
        console.error('错误：没有加载任何模型。');
        win.webContents.send('llm-stream-error', '模型未加载，请先在设置中选择并加载模型。');
        return;
    }

    // [修改] 动态导入 ESM 模块
    const { LlamaContext, LlamaChatSession } = await import("node-llama-cpp");

    try {
        // 每次提问都创建一个新的会话，以获得干净的上下文
        // 对于需要连续对话的场景，可以复用 session
        const context = new LlamaContext({ model });
        session = new LlamaChatSession({ context });

        console.log(`用户提问: ${prompt}`);

        // 核心：使用 for await...of 处理流式响应
        const stream = await session.prompt(prompt);

        for await (const chunk of stream) {
            // 将每个 token 块发送给渲染进程
            win.webContents.send('llm-token-stream', chunk.token);
        }

    } catch (error) {
        console.error('聊天推理时发生错误:', error);
        win.webContents.send('llm-stream-error', `推理失败: ${error.message}`);
    } finally {
        // 通知渲染进程流已结束
        win.webContents.send('llm-stream-end');
        console.log('聊天流结束。');
    }
}

module.exports = {
    loadModel,
    startChatStream
};