// src/stores/solverStore.js

import { defineStore } from 'pinia'
import { useNoteStore } from './noteStore'

export const useSolverStore = defineStore('solver', {
    state: () => ({
        mode: 'chat', // 'chat' | 'context'
        isThinking: false,

        // 对话历史
        chatHistory: [
            { role: 'ai', text: '你好，我是 Solver，你的 AI 知识助手。选中一篇笔记我会自动分析，你也可以直接向我提问。' }
        ],

        // 智能关联 (Context)
        relatedContexts: [],

        // 流式响应的文本缓冲区
        streamingText: '',

        // 用于显示后端错误的字段
        error: null,

        // 用于管理监听器的清理函数
        _listeners: []
    }),

    actions: {
        /**
         * 初始化并注册与 Electron 主进程的流式通信监听器
         */
        setupListeners() {
            this.cleanupListeners();
            if (!window.electronAPI) return;

            const unsubscribeToken = window.electronAPI.onLLMToken((token) => {
                this.streamingText += token;
            });
            this._listeners.push(unsubscribeToken);

            const unsubscribeEnd = window.electronAPI.onLLMEnd(() => {
                if (this.streamingText) {
                    this.chatHistory.push({ role: 'ai', text: this.streamingText });
                }
                this.streamingText = '';
                this.isThinking = false;
            });
            this._listeners.push(unsubscribeEnd);

            const unsubscribeError = window.electronAPI.onLLMError((errorMsg) => {
                this.error = errorMsg;
                this.isThinking = false;
                setTimeout(() => { this.error = null; }, 5000);
            });
            this._listeners.push(unsubscribeError);
        },

        /**
         * 清理所有活动的监听器
         */
        cleanupListeners() {
            this._listeners.forEach(unsubscribe => unsubscribe());
            this._listeners = [];
        },

        /**
         * 分析选中的笔记 (当 noteStore.selectedNoteId 变化时调用)
         */
        async analyzeContext(noteId) {
            if (!noteId) {
                this.mode = 'chat';
                return;
            }

            this.mode = 'context';
            this.isThinking = true;
            this.relatedContexts = [];
            this.error = null;

            const noteStore = useNoteStore();
            const selectedNote = noteStore.notes.find(n => n.id === noteId);

            if (!selectedNote || !window.electronAPI) {
                this.isThinking = false;
                if (!window.electronAPI) console.warn('Electron API not found.');
                return;
            }

            try {
                // ======================================================================
                // --- 核心 Bug 修复 ---
                // 错误原因：将整篇笔记的长文本作为查询输入，超出了嵌入模型的上下文长度限制。
                // 解决方案：构造一个更短、更有代表性的查询文本。
                // 策略：优先使用笔记的标题。如果没有标题，则使用笔记内容的前 200 个字符。
                // 这个长度（200个字符）对于嵌入模型来说是安全的。
                // ======================================================================

                let queryText = '';
                // 优先使用笔记的标题作为查询文本
                if (selectedNote.title && selectedNote.title.trim()) {
                    queryText = selectedNote.title;
                } else if (selectedNote.content && selectedNote.content.trim()) {
                    // 如果没有标题，则截取内容的前200个字符作为查询
                    queryText = selectedNote.content.substring(0, 200);
                }

                // 如果最终的查询文本为空，则不执行搜索
                if (!queryText.trim()) {
                    this.relatedContexts = [];
                    this.isThinking = false;
                    return;
                }

                console.log(`[SolverStore] 使用以下文本进行智能关联搜索: "${queryText}"`);

                const results = await window.electronAPI.semanticSearch(queryText);

                // [增强逻辑] 过滤掉与当前笔记自身完全相同的结果
                this.relatedContexts = results.filter(result => result.id !== selectedNote.id);

            } catch (err) {
                console.error('Semantic search failed:', err);
                this.error = '智能关联分析失败。';
            } finally {
                this.isThinking = false;
            }
        },

        /**
         * 发送聊天消息
         * @param {string} text - 用户输入的消息
         */
        async sendMessage(text) {
            if (!text || !text.trim() || this.isThinking) return;
            if (!window.electronAPI) {
                this.error = 'AI 功能仅在桌面应用中可用。';
                return;
            }

            this.error = null;
            this.chatHistory.push({ role: 'user', text });

            const noteStore = useNoteStore();
            const contextNote = noteStore.activeNote;
            const contextContent = contextNote ? contextNote.content : null;

            this.streamingText = '';
            this.isThinking = true;

            try {
                await window.electronAPI.startChat(text, contextContent);
            } catch (err) {
                console.error('Failed to start chat stream:', err);
                this.error = `无法开始对话: ${err.message}`;
                this.isThinking = false;
            }
        },

        toggleMode() {
            this.mode = this.mode === 'chat' ? 'context' : 'chat';
        }
    }
});