import { defineStore } from 'pinia'
// [核心修复] 移除 useRoute，因为它不能在 store action 中使用
// import { useRoute } from 'vue-router'
import { useNoteStore } from './noteStore'

/**
 * [日志] 内部辅助函数，用于生成一个简单的唯一追踪ID。
 * @returns {string} 格式为 'trace-<timestamp>-<random>' 的字符串。
 */
function generateTraceId() {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export const useSolverStore = defineStore('solver', {
    state: () => ({
        mode: 'chat',
        isThinking: false,
        chatHistory: [
            { role: 'ai', text: '你好，我是 Solver，你的 AI 知识助手。在主页输入时我会分析你的草稿，在笔记页面我会分析当前笔记。' }
        ],
        relatedContexts: [],
        streamingText: '',
        error: null,
        draftContext: '',
        isContextToggleOn: true,
        _listeners: []
    }),

    actions: {
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

        cleanupListeners() {
            this._listeners.forEach(unsubscribe => unsubscribe());
            this._listeners = [];
        },

        async analyzeContext(noteId) {
            const traceId = generateTraceId();
            console.log(`[SolverStore][${traceId}] 基于笔记的智能关联启动...`, { noteId });

            if (!noteId) {
                this.mode = 'chat';
                return;
            }

            this.mode = 'context';
            this.isThinking = true;
            this.relatedContexts = [];
            this.error = null;

            const noteStore = useNoteStore();
            const selectedNote = noteStore.getNoteById(noteId);

            if (!selectedNote || !window.electronAPI) {
                this.isThinking = false;
                return;
            }

            try {
                let queryText = selectedNote.title?.trim() || selectedNote.content?.substring(0, 200);
                if (!queryText.trim()) {
                    this.isThinking = false;
                    return;
                }

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

        async analyzeDraft(draftContent) {
            const traceId = generateTraceId();
            if (!draftContent || !draftContent.trim()) {
                this.mode = 'chat';
                this.relatedContexts = [];
                return;
            }

            console.log(`[SolverStore][${traceId}] 基于草稿的智能关联启动...`);
            this.mode = 'context';
            this.isThinking = true;
            this.relatedContexts = [];
            this.error = null;

            try {
                const results = await window.electronAPI.semanticSearch({
                    queryText: draftContent,
                    traceId: traceId,
                    excludeId: null
                });
                if (Array.isArray(results)) {
                    this.relatedContexts = results;
                }
            } catch (err) {
                console.error(`[SolverStore][${traceId}] 草稿关联搜索失败:`, err);
                this.error = '草稿分析失败，请检查后台日志。';
            } finally {
                this.isThinking = false;
            }
        },

        /**
         * [核心修复] sendMessage action 变得更通用。
         * 它现在接收一个可选的 contextContent 参数，不再关心路由。
         * 决定提供哪个上下文的逻辑被移到了调用它的组件 (SolverSidebar.vue) 中。
         *
         * @param {string} text - 用户输入的消息文本。
         * @param {string | null} contextContent - (可选) 由组件提供的上下文内容。
         */
        async sendMessage(text, contextContent = null) {
            if (!text.trim() || this.isThinking || !window.electronAPI) return;

            this.error = null;
            this.chatHistory.push({ role: 'user', text });

            // 1. 决定最终要发送的上下文
            // 如果用户开启了上下文关联，并且调用者提供了上下文内容，则使用它。
            const finalContext = this.isContextToggleOn ? contextContent : null;

            // 2. 发送请求
            this.streamingText = '';
            this.isThinking = true;
            try {
                console.log(`[SolverStore] 发送聊天请求，上下文长度: ${finalContext?.length || 0}`);
                await window.electronAPI.startChat(text, finalContext);
            } catch (err) {
                console.error('无法开始聊天流:', err);
                this.error = `无法开始对话: ${err.message}`;
                this.isThinking = false;
            }
        },

        setDraftContext(content) {
            this.draftContext = content;
        },

        clearDraftContext() {
            this.draftContext = '';
            if (this.mode === 'context') {
                this.mode = 'chat';
                this.relatedContexts = [];
            }
        },

        toggleContextInclusion() {
            this.isContextToggleOn = !this.isContextToggleOn;
        },

        switchToChatMode() {
            this.mode = 'chat';
        }
    }
});