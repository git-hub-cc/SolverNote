// src/stores/solverStore.js

import { defineStore } from 'pinia';
import { useNoteStore } from './noteStore';

/**
 * [日志] 内部辅助函数，用于生成一个简单的唯一追踪ID。
 */
function generateTraceId() {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export const useSolverStore = defineStore('solver', {
    state: () => ({
        mode: 'chat',
        isThinking: false,
        chatHistory: [
            { role: 'ai', text: '你好，我是 Solver，你的 AI 知识助手。我可以分析你在主页输入的草稿，也可以在你查看笔记时分析当前笔记内容。' }
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

        // --- 上下文分析 ---
        async analyzeContext(noteId) {
            const traceId = generateTraceId();
            console.log(`[SolverStore][${traceId}] 开始基于笔记的上下文分析...`, { noteId });

            if (!noteId) { this.mode = 'chat'; return; }
            this.mode = 'context';
            this.isThinking = true;
            this.relatedContexts = [];
            this.error = null;

            const noteStore = useNoteStore();
            const selectedNote = noteStore.getNoteById(noteId);
            if (!selectedNote || !window.electronAPI) { this.isThinking = false; return; }

            try {
                let queryText = selectedNote.title?.trim() || selectedNote.content?.substring(0, 200);
                if (!queryText.trim()) { this.isThinking = false; return; }

                console.log(`[SolverStore][${traceId}] 正在调用 semanticSearch...`, { queryText });
                const results = await window.electronAPI.semanticSearch({ queryText, traceId, excludeId: noteId });
                console.log(`[SolverStore][${traceId}] semanticSearch 返回 ${results.length} 条结果。`, results);

                this.relatedContexts = Array.isArray(results) ? results : [];
            } catch (err) {
                console.error(`[SolverStore][${traceId}] 上下文搜索失败:`, err);
                this.error = '上下文分析失败，请检查日志。';
            } finally {
                this.isThinking = false;
            }
        },
        async analyzeDraft(draftContent) {
            const traceId = generateTraceId();
            if (!draftContent || !draftContent.trim()) {
                this.mode = 'chat'; this.relatedContexts = []; return;
            }
            console.log(`[SolverStore][${traceId}] 开始基于草稿的上下文分析...`);
            this.mode = 'context'; this.isThinking = true;
            this.relatedContexts = []; this.error = null;

            try {
                console.log(`[SolverStore][${traceId}] 正在调用 semanticSearch...`, { queryText: draftContent });
                const results = await window.electronAPI.semanticSearch({ queryText: draftContent, traceId, excludeId: null });
                console.log(`[SolverStore][${traceId}] semanticSearch 返回 ${results.length} 条结果。`, results);

                this.relatedContexts = Array.isArray(results) ? results : [];
            } catch (err) {
                console.error(`[SolverStore][${traceId}] 草稿分析失败:`, err);
                this.error = '草稿分析失败，请检查日志。';
            } finally {
                this.isThinking = false;
            }
        },

        // --- 聊天功能 ---
        async sendMessage(text, contextContent = null) {
            if (!text.trim() || this.isThinking || !window.electronAPI) return;
            this.error = null;
            this.chatHistory.push({ role: 'user', text });
            const finalContext = this.isContextToggleOn ? contextContent : null;
            this.streamingText = '';
            this.isThinking = true;
            try {
                console.log(`[SolverStore] 正在发送聊天请求... Context length: ${finalContext?.length || 0}`);
                await window.electronAPI.startChat(text, finalContext);
            } catch (err) {
                console.error('[SolverStore] 启动聊天流失败:', err);
                this.error = `无法启动聊天: ${err.message}`;
                this.isThinking = false;
            }
        },

        // --- 标签生成 ---
        async generateTagsFromContent(content) {
            if (!content || !content.trim() || !window.electronAPI) return [];
            console.log('[SolverStore] 请求 AI 生成标签...');

            const prompt = `Task: Extract top 5 relevant tags from the text below.\nRules:\n1. Output strictly a JSON array of strings.\n2. No explanations, no extra text.\n3. Sort by relevance (highest first).\n4. Example output: ["keyword1", "keyword2", "keyword3"]\n\nText to analyze:\n${content.substring(0, 1000)}\n\nTags (JSON array):`;
            try {
                const response = await window.electronAPI.generateTags(prompt);
                console.log('[SolverStore] AI 原始响应:', response);

                if (response && typeof response === 'string') {
                    let rawText = response.trim().replace(/```json/g, '').replace(/```/g, '').trim();
                    const jsonMatch = rawText.match(/\[.*\]/s);
                    if (jsonMatch) {
                        const tags = JSON.parse(jsonMatch[0]);
                        if (Array.isArray(tags)) {
                            const finalTags = tags.filter(t => typeof t === 'string').map(t => t.toLowerCase().trim()).slice(0, 5);
                            console.log('[SolverStore] 成功解析出标签:', finalTags);
                            return finalTags;
                        }
                    }
                }
                throw new Error('AI 返回格式无效');
            } catch (error) {
                console.error('[SolverStore] 标签生成或解析失败:', error);
                return [];
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