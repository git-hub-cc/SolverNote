import { defineStore } from 'pinia'

// 模拟数据 (在浏览器环境开发时，作为回退方案)
const MOCK_NOTES = [
    {
        id: 'mock-1.md',
        content: '**欢迎使用 SolverNote**\n这是一个模拟数据。\n\n> 提示：请在 Electron 中启动以启用文件读写。',
        timestamp: new Date().toISOString(),
        tags: ['welcome'],
        title: '欢迎笔记'
    },
    {
        id: 'mock-2.md',
        content: '- [x] 任务 A\n- [ ] 任务 B\n\n支持标准 Markdown 渲染。',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        tags: ['todo'],
        title: '待办事项'
    }
]

export const useNoteStore = defineStore('notes', {
    state: () => ({
        /**
         * 内部笔记缓存。
         * 这是所有笔记的唯一真实来源 (Single Source of Truth)，直接从后端加载。
         * @type {Array<Object>}
         */
        _allNotesCache: [],

        // --- 核心状态 ---
        loading: false,       // 是否正在从后端加载数据
        error: null,          // 错误信息
        searchQuery: '',      // 当前的搜索关键词
        isSyncing: false,     // 是否正在与后端同步（保存/删除）

        // --- UI 交互状态 ---
        selectedNoteId: null, // 当前在 UI 上高亮的笔记ID (可以是时间线或单页视图)
        scrollToNoteId: null  // 用于触发滚动到指定笔记的状态
    }),

    getters: {
        /**
         * 根据 ID 高效查找笔记的 Getter。
         * @returns {(id: string) => Object | undefined} 一个接受笔记 ID 并返回笔记对象的函数。
         */
        getNoteById: (state) => {
            return (id) => state._allNotesCache.find(note => note.id === id);
        },

        /**
         * `notes` getter 根据 `searchQuery` 动态地从 `_allNotesCache` 中过滤出要显示的笔记。
         * 这是非破坏性的，原始缓存 `_allNotesCache` 始终保持完整。
         */
        notes: (state) => {
            if (!state.searchQuery || state.searchQuery.trim() === '') {
                return state._allNotesCache;
            }
            const lowerQuery = state.searchQuery.toLowerCase().trim();
            return state._allNotesCache.filter(note => {
                const inTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
                // [核心修改] 增加对 note.id (文件名) 的搜索，使前后端逻辑统一
                const inId = note.id.toLowerCase().includes(lowerQuery);
                const inContent = note.content.toLowerCase().includes(lowerQuery);
                const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
                // [核心修改] 将 inId 加入到最终的布尔判断中
                return inTitle || inId || inContent || inTags;
            });
        },

        /**
         * `allTags` getter 必须从完整的缓存 `_allNotesCache` 中计算，
         * 确保无论当前搜索条件是什么，它总能返回所有标签的正确统计。
         */
        allTags: (state) => {
            const tagMap = new Map();
            state._allNotesCache.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => {
                        if (typeof tag !== 'string' || !tag.trim()) return;
                        const normalizedTag = tag.trim();
                        tagMap.set(normalizedTag, (tagMap.get(normalizedTag) || 0) + 1);
                    });
                }
            });
            return Array.from(tagMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
        }
    },

    actions: {
        /**
         * 从后端获取所有笔记并填充缓存。
         */
        async fetchNotes() {
            this.loading = true;
            this.error = null;
            try {
                if (window.electronAPI) {
                    this._allNotesCache = await window.electronAPI.loadNotes();
                } else {
                    console.warn('Electron API not found, using mock data.');
                    await new Promise(r => setTimeout(r, 300));
                    if (this._allNotesCache.length === 0) {
                        this._allNotesCache = MOCK_NOTES;
                    }
                }
            } catch (err) {
                console.error('Failed to fetch notes:', err);
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },

        /**
         * 保存或更新笔记。
         * [核心重构] 此方法现在非常通用，可以接收一个包含 id 的完整对象。
         * 它不再关心 "编辑模式"，只负责将数据发送到后端。
         * 创建新笔记和更新现有笔记都通过这个 action 完成。
         */
        async saveNote(payloadData) {
            this.isSyncing = true;
            this.error = null;

            try {
                // 鲁棒性检查：确保内容不为空
                if (!payloadData.content || !payloadData.content.trim()) {
                    console.warn('[NoteStore] Canceled save due to empty content.');
                    return;
                }

                if (window.electronAPI) {
                    // 使用 toRaw/JSON.parse 解包 Proxy 对象，确保纯净数据传递给后端
                    const cleanPayload = JSON.parse(JSON.stringify(payloadData));
                    const result = await window.electronAPI.saveNote(cleanPayload);

                    if (result.success) {
                        // 保存成功后，刷新整个缓存以获取最新数据（包括后端生成的标题等）
                        await this.fetchNotes();
                    } else {
                        throw new Error(result.error);
                    }
                } else {
                    // 模拟数据逻辑
                    const id = payloadData.id || `mock-${Date.now()}.md`;
                    const index = this._allNotesCache.findIndex(n => n.id === id);
                    const newNote = {
                        id,
                        content: payloadData.content,
                        tags: payloadData.tags || [],
                        title: payloadData.content.split('\n')[0].replace(/^#\s*/, '').trim(),
                        timestamp: new Date().toISOString()
                    };
                    if (index > -1) {
                        this._allNotesCache[index] = newNote;
                    } else {
                        this._allNotesCache.unshift(newNote);
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
            } catch (err) {
                console.error('Save failed:', err);
                this.error = '保存笔记失败';
            } finally {
                this.isSyncing = false;
            }
        },

        /**
         * 删除笔记。确认对话框移至组件层，store 只负责执行。
         */
        async deleteNote(id) {
            if (!id) return;
            this.isSyncing = true;
            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.deleteNote(id);
                    if (!result.success) throw new Error(result.error);
                }

                // 无论后端或模拟，都直接在前端缓存中操作以立即响应
                const index = this._allNotesCache.findIndex(n => n.id === id);
                if (index > -1) this._allNotesCache.splice(index, 1);

                // 如果被删除的笔记是当前选中的，则取消选中
                if (this.selectedNoteId === id) this.selectedNoteId = null;

            } catch (err) {
                console.error('Delete failed:', err);
                this.error = err.message;
            } finally {
                this.isSyncing = false;
            }
        },

        // --- UI 交互 Actions ---

        /**
         * 设置全局搜索查询。
         * @param {string} query
         */
        setSearchQuery(query) {
            this.searchQuery = query;
        },

        /**
         * 设置当前选中的笔记 ID。
         * @param {string} id
         */
        selectNote(id) {
            this.selectedNoteId = id;
        },

        /**
         * 取消笔记的选中状态。
         */
        deselectNote() {
            this.selectedNoteId = null;
        },

        /**
         * 请求滚动到指定笔记。
         * @param {string} noteId
         */
        scrollToNote(noteId) {
            if (this._allNotesCache.some(n => n.id === noteId)) {
                if (this.searchQuery) this.setSearchQuery('');
                this.scrollToNoteId = noteId;
                this.selectedNoteId = noteId;
            } else {
                console.warn(`[NoteStore] 无法跳转：未找到 ID 为 ${noteId} 的笔记。`);
            }
        }
    }
});