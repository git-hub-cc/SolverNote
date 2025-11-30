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
        mode: 'chat', // 'chat' | 'context'
        isThinking: false,
        chatHistory: [
            { role: 'ai', text: '你好，我是 Solver，你的 AI 知识助手。选中一篇笔记我会自动分析，你也可以直接向我提问。' }
        ],
        relatedContexts: [],
        streamingText: '',
        error: null,
        _listeners: []
    }),

    actions: {
        // --- 监听器设置与清理 (保持不变) ---
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

        /**
         * 分析选中的笔记 (当 noteStore.selectedNoteId 变化时调用)
         * [修改说明]: 增加 excludeId 参数传递，用于后端过滤当前笔记自身。
         */
        async analyzeContext(noteId) {
            // --- 1. 初始化流程 ---
            const traceId = generateTraceId(); // 为本次请求生成唯一ID
            const startTime = performance.now(); // 记录开始时间以计算总耗时

            console.log(`[INFO][SolverStore][${traceId}] 智能关联分析流程启动。`, { noteId });

            if (!noteId) {
                this.mode = 'chat';
                console.log(`[INFO][SolverStore][${traceId}] 因 noteId 为空，切换回聊天模式。流程结束。`);
                return;
            }

            this.mode = 'context';
            this.isThinking = true;
            this.relatedContexts = [];
            this.error = null;

            const noteStore = useNoteStore();
            const selectedNote = noteStore.notes.find(n => n.id === noteId);

            if (!selectedNote) {
                this.isThinking = false;
                console.warn(`[WARN][SolverStore][${traceId}] 未在 store 中找到 ID 为 ${noteId} 的笔记。流程中断。`);
                return;
            }

            if (!window.electronAPI) {
                this.isThinking = false;
                console.warn(`[WARN][SolverStore][${traceId}] Electron API 未找到，无法执行搜索。流程中断。`);
                return;
            }

            try {
                // --- 2. 构造查询文本 ---
                let queryText = '';
                let querySource = 'unknown';

                // 优先使用标题，如果没有标题则使用内容前200个字符
                if (selectedNote.title && selectedNote.title.trim()) {
                    queryText = selectedNote.title;
                    querySource = 'title';
                } else if (selectedNote.content && selectedNote.content.trim()) {
                    queryText = selectedNote.content.substring(0, 200);
                    querySource = 'content_snippet';
                }

                console.debug(`[DEBUG][SolverStore][${traceId}] 构造查询文本。`, {
                    queryText,
                    source: querySource
                });

                if (!queryText.trim()) {
                    this.relatedContexts = [];
                    this.isThinking = false;
                    console.log(`[INFO][SolverStore][${traceId}] 查询文本为空，无需搜索。流程结束。`);
                    return;
                }

                // --- 3. 调用后端进行语义搜索 ---
                // [关键修改] 传递 excludeId (即当前 noteId) 给后端，用于排除自身
                console.debug(`[DEBUG][SolverStore][${traceId}] 正在通过 IPC 调用 'semanticSearch'。`, { queryText, excludeId: noteId });

                const results = await window.electronAPI.semanticSearch({
                    queryText: queryText,
                    traceId: traceId,
                    excludeId: noteId // 传入当前 ID 以便后端过滤
                });

                console.debug(`[DEBUG][SolverStore][${traceId}] 从 IPC 接收到搜索结果。`, { resultCount: results?.length });

                // --- 4. 处理并更新前端状态 ---
                if (Array.isArray(results)) {
                    // 后端已经做过去重和排除自身处理，前端直接赋值即可
                    this.relatedContexts = results;
                    console.log(`[INFO][SolverStore][${traceId}] 搜索成功，展示 ${this.relatedContexts.length} 个结果。`);
                } else {
                    console.error(`[ERROR][SolverStore][${traceId}] IPC 返回了非预期的格式。`, { received: results });
                    this.error = '智能关联返回数据格式错误。';
                    this.relatedContexts = [];
                }

            } catch (err) {
                console.error(`[ERROR][SolverStore][${traceId}] 智能关联搜索失败:`, err);
                this.error = '智能关联分析失败，请检查后台日志。';
            } finally {
                this.isThinking = false;
                const durationMs = (performance.now() - startTime).toFixed(2);
                console.log(`[INFO][SolverStore][${traceId}] 智能关联分析流程结束。总耗时: ${durationMs}ms。`);
            }
        },

        // --- 聊天相关逻辑 (保持不变) ---
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