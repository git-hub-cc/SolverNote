import { defineStore } from 'pinia'
import { useNoteStore } from './noteStore'

export const useSolverStore = defineStore('solver', {
    state: () => ({
        mode: 'chat', // 'chat' | 'context'
        isThinking: false,

        // 对话历史
        chatHistory: [
            { role: 'ai', text: '我是 Solver，你的知识库助手。有什么可以帮你？' }
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
         * 建议在应用根组件 (App.vue) 中调用一次
         */
        setupListeners() {
            // 清理旧的监听器，防止重复注册
            this.cleanupListeners();

            if (!window.electronAPI) return;

            // 监听新的 token
            const unsubscribeToken = window.electronAPI.onLLMToken((token) => {
                this.streamingText += token;
            });
            this._listeners.push(unsubscribeToken);

            // 监听流结束事件
            const unsubscribeEnd = window.electronAPI.onLLMEnd(() => {
                if (this.streamingText) {
                    this.chatHistory.push({ role: 'ai', text: this.streamingText });
                }
                this.streamingText = '';
                this.isThinking = false;
            });
            this._listeners.push(unsubscribeEnd);

            // 监听错误事件
            const unsubscribeError = window.electronAPI.onLLMError((errorMsg) => {
                this.error = errorMsg;
                this.isThinking = false;
                // 5秒后自动清除错误信息
                setTimeout(() => { this.error = null; }, 5000);
            });
            this._listeners.push(unsubscribeError);
        },

        /**
         * 清理所有活动的监听器
         * 在组件卸载或重新设置监听器时调用
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
                this.relatedContexts = [];
                this.isThinking = false;
                if (!window.electronAPI) console.warn('Electron API not found.');
                return;
            }

            try {
                // 调用后端真实的语义搜索接口
                const results = await window.electronAPI.semanticSearch(selectedNote.content);
                // 更新 title (这里简化为 id, 实际应用可从元数据获取)
                this.relatedContexts = results.map(r => ({ ...r, title: r.id }));
            } catch (err) {
                console.error('Semantic search failed:', err);
                this.error = 'Failed to analyze context.';
            } finally {
                this.isThinking = false;
            }
        },

        /**
         * 发送聊天消息
         */
        async sendMessage(text) {
            if (!text.trim() || this.isThinking) return;
            if (!window.electronAPI) {
                console.error('Electron API not found. Cannot send message.');
                this.error = 'AI 功能仅在桌面应用中可用。';
                return;
            }

            // 1. 清空错误，用户消息上屏
            this.error = null;
            this.chatHistory.push({ role: 'user', text });

            // 2. 重置流式缓冲区并设置思考状态
            this.streamingText = '';
            this.isThinking = true;

            try {
                // 3. 调用后端开始流式聊天，后续由监听器处理
                await window.electronAPI.startChat(text);
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