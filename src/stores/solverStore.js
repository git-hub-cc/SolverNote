// src/stores/solverStore.js

import { defineStore } from 'pinia'
import { useNoteStore } from './noteStore'

/**
 * [日志] 内部辅助函数，用于生成一个简单的唯一追踪ID。
 * 在本地应用场景下，时间戳+随机数足以保证唯一性。
 * @returns {string} 格式为 'trace-<timestamp>-<random>' 的字符串。
 */
function generateTraceId() {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export const useSolverStore = defineStore('solver', {
    state: () => ({
        mode: 'chat', // 当前模式: 'chat' (聊天) | 'context' (智能关联)
        isThinking: false, // AI 是否正在处理请求
        chatHistory: [ // 聊天历史记录
            { role: 'ai', text: '你好，我是 Solver，你的 AI 知识助手。选中一篇笔记我会自动分析，你也可以直接向我提问。' }
        ],
        relatedContexts: [], // 智能关联找到的相关笔记片段
        streamingText: '',   // 流式响应的当前文本
        error: null,         // 错误信息
        _listeners: []       // 用于存储 Electron IPC 事件的取消订阅函数
    }),

    actions: {
        // --- 监听器设置与清理 ---

        /**
         * 设置 Electron IPC 事件监听器。
         * 用于接收来自主进程的 LLM token 流、结束信号和错误信息。
         */
        setupListeners() {
            this.cleanupListeners(); // 先清理旧的监听器，防止重复注册
            if (!window.electronAPI) return;

            // 监听 token 流
            const unsubscribeToken = window.electronAPI.onLLMToken((token) => {
                this.streamingText += token;
            });
            this._listeners.push(unsubscribeToken);

            // 监听流结束信号
            const unsubscribeEnd = window.electronAPI.onLLMEnd(() => {
                if (this.streamingText) {
                    // 将完整的流式响应存入聊天历史
                    this.chatHistory.push({ role: 'ai', text: this.streamingText });
                }
                this.streamingText = ''; // 清空流式文本
                this.isThinking = false; // 重置思考状态
            });
            this._listeners.push(unsubscribeEnd);

            // 监听错误信号
            const unsubscribeError = window.electronAPI.onLLMError((errorMsg) => {
                this.error = errorMsg;
                this.isThinking = false;
                setTimeout(() => { this.error = null; }, 5000); // 5秒后自动清除错误
            });
            this._listeners.push(unsubscribeError);
        },

        /**
         * 清理所有已注册的 IPC 监听器，防止内存泄漏。
         */
        cleanupListeners() {
            this._listeners.forEach(unsubscribe => unsubscribe());
            this._listeners = [];
        },

        /**
         * 分析选中的笔记，并触发智能关联搜索。
         * @param {string} noteId - 被选中的笔记 ID。
         */
        async analyzeContext(noteId) {
            const traceId = generateTraceId(); // 为本次请求生成唯一ID
            console.log(`[SolverStore][${traceId}] 智能关联分析流程启动...`, { noteId });

            if (!noteId) {
                this.mode = 'chat'; // 如果没有选中笔记，则切换回聊天模式
                return;
            }

            // 初始化状态
            this.mode = 'context';
            this.isThinking = true;
            this.relatedContexts = [];
            this.error = null;

            const noteStore = useNoteStore();
            const selectedNote = noteStore.notes.find(n => n.id === noteId);

            if (!selectedNote || !window.electronAPI) {
                this.isThinking = false;
                return;
            }

            try {
                // 优先使用标题作为查询文本，否则使用内容摘要
                let queryText = selectedNote.title?.trim() || selectedNote.content?.substring(0, 200);

                if (!queryText.trim()) {
                    this.isThinking = false;
                    return;
                }

                // 调用 Electron 后端进行语义搜索，并排除当前笔记自身
                const results = await window.electronAPI.semanticSearch({
                    queryText: queryText,
                    traceId: traceId,
                    excludeId: noteId
                });

                if (Array.isArray(results)) {
                    this.relatedContexts = results;
                }
            } catch (err) {
                console.error(`[SolverStore][${traceId}] 智能关联搜索失败:`, err);
                this.error = '智能关联分析失败，请检查后台日志。';
            } finally {
                this.isThinking = false;
            }
        },

        /**
         * 发送聊天消息。
         * @param {string} text - 用户输入的消息文本。
         */
        async sendMessage(text) {
            if (!text.trim() || this.isThinking || !window.electronAPI) return;

            this.error = null;
            this.chatHistory.push({ role: 'user', text }); // 将用户消息添加到历史记录

            // 如果当前选中了笔记，则将其内容作为上下文
            const noteStore = useNoteStore();
            const contextContent = noteStore.activeNote ? noteStore.activeNote.content : null;

            this.streamingText = '';
            this.isThinking = true;

            try {
                // 调用 Electron 后端开始聊天
                await window.electronAPI.startChat(text, contextContent);
            } catch (err) {
                console.error('无法开始聊天流:', err);
                this.error = `无法开始对话: ${err.message}`;
                this.isThinking = false;
            }
        },

        /**
         * [新增] 切换到聊天模式。
         * 用于在“智能关联”视图中，通过点击按钮明确地返回聊天界面。
         */
        switchToChatMode() {
            this.mode = 'chat';
        }
    }
});