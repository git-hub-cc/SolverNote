import { defineStore } from 'pinia'
import { useNoteStore } from './noteStore'

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
            { role: 'ai', text: 'Hello, I am Solver, your AI knowledge assistant. I can analyze your drafts on the home page or analyze the current note when viewing one.' }
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
            console.log(`[SolverStore][${traceId}] Starting Note-based Context Analysis...`, { noteId });

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
                console.error(`[SolverStore][${traceId}] Context Search Failed:`, err);
                this.error = 'Context analysis failed. Please check logs.';
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

            console.log(`[SolverStore][${traceId}] Starting Draft-based Context Analysis...`);
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
                console.error(`[SolverStore][${traceId}] Draft Search Failed:`, err);
                this.error = 'Draft analysis failed. Please check logs.';
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
                console.log(`[SolverStore] Sending chat request, context length: ${finalContext?.length || 0}`);
                await window.electronAPI.startChat(text, finalContext);
            } catch (err) {
                console.error('Failed to start chat stream:', err);
                this.error = `Unable to start chat: ${err.message}`;
                this.isThinking = false;
            }
        },

        // --- [新增] 生成 Tags 功能 ---
        /**
         * 基于内容生成 5 个推荐标签。
         * @param {string} content - 需要分析的文本内容
         * @returns {Promise<string[]>} - 标签数组
         */
        async generateTagsFromContent(content) {
            if (!content || !content.trim()) return [];
            if (!window.electronAPI) {
                console.warn('[SolverStore] Electron API unavailable for tag generation.');
                return [];
            }

            console.log('[SolverStore] Requesting tag generation...');

            // 构造强约束的 Prompt，要求输出 JSON
            const prompt = `
Task: Extract top 5 relevant tags from the text below.
Rules:
1. Output strictly a JSON array of strings.
2. No explanations, no extra text.
3. Sort by relevance (highest first).
4. Example output: ["keyword1", "keyword2", "keyword3"]

Text to analyze:
${content.substring(0, 1000)}

Tags (JSON array):`.trim();

            try {
                const response = await window.electronAPI.generateTags(prompt);

                if (response.success && response.text) {
                    let rawText = response.text.trim();
                    console.log('[SolverStore] Raw tag response:', rawText);

                    // 清理可能存在的 Markdown 代码块标记 (例如 ```json ... ```)
                    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

                    // 尝试找到 JSON 数组部分 (以 [ 开头，以 ] 结尾)
                    const jsonMatch = rawText.match(/\[.*\]/s);
                    if (jsonMatch) {
                        rawText = jsonMatch[0];
                    }

                    const tags = JSON.parse(rawText);
                    if (Array.isArray(tags)) {
                        // 过滤非字符串项，取前5个，转换为小写
                        return tags
                            .filter(t => typeof t === 'string')
                            .map(t => t.toLowerCase().trim())
                            .slice(0, 5);
                    }
                }
                throw new Error('Invalid model response format');
            } catch (error) {
                console.error('[SolverStore] Tag generation failed:', error);
                // 不向用户显示错误，静默失败，避免打扰编辑器流程
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