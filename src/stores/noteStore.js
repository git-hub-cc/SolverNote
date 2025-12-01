import { defineStore } from 'pinia'

// 模拟数据 (浏览器环境开发时的回退方案)
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
         * 它不应该被搜索等前端过滤操作直接修改，从而避免状态污染。
         * @type {Array<Object>}
         */
        _allNotesCache: [],

        // --- 其他状态 ---
        loading: false,       // 是否正在从后端加载数据
        error: null,          // 错误信息
        searchQuery: '',      // 当前的搜索关键词
        selectedNoteId: null, // 当前选中的笔记ID

        // `editingNote` 主要用于主时间线上的快速编辑功能。
        // 单文件视图的编辑状态由其组件内部管理。
        editingNote: null,

        isSyncing: false,     // 是否正在与后端同步（保存/删除）
        scrollToNoteId: null  // 用于触发滚动到指定笔记的状态
    }),

    getters: {
        /**
         * [核心新增] 根据 ID 高效查找笔记的 Getter。
         * 这是一个函数式 Getter，允许传递参数，使得在组件中查找特定笔记变得非常方便。
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
                const inContent = note.content.toLowerCase().includes(lowerQuery);
                const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
                return inTitle || inContent || inTags;
            });
        },

        activeNote: (state) => state._allNotesCache.find(n => n.id === state.selectedNoteId),

        isEditMode: (state) => !!state.editingNote,

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
         * 从后端获取笔记并填充缓存。
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
         * 此方法现在非常通用，可以接收一个包含 id 的完整对象，
         * 使得 SingleNoteView 中的自动保存逻辑可以直接调用。
         */
        async saveNote(payloadData) {
            this.isSyncing = true;
            this.error = null;

            try {
                // 构造要发送到后端的最终数据
                const payload = {
                    id: this.editingNote?.id, // 优先使用编辑模式的 ID
                    content: '',
                    tags: [],
                    ...payloadData // 传入的数据会覆盖默认值
                };

                // 鲁棒性检查：确保内容不为空
                if (!payload.content || !payload.content.trim()) return;

                if (window.electronAPI) {
                    // 使用 toRaw/JSON.parse 解包 Proxy 对象，确保纯净数据传递给后端
                    const cleanPayload = JSON.parse(JSON.stringify(payload));
                    const result = await window.electronAPI.saveNote(cleanPayload);

                    if (result.success) {
                        // 保存成功后，刷新整个缓存以获取最新数据（包括后端生成的标题等）
                        await this.fetchNotes();
                        this.editingNote = null; // 清除旧的编辑状态
                    } else {
                        throw new Error(result.error);
                    }
                } else {
                    // 模拟数据逻辑
                    const id = payload.id || `mock-${Date.now()}.md`;
                    const index = this._allNotesCache.findIndex(n => n.id === id);
                    const newNote = {
                        id,
                        content: payload.content,
                        tags: payload.tags,
                        title: payload.content.split('\n')[0].replace(/^#\s*/, '').trim(),
                        timestamp: new Date().toISOString()
                    };
                    if (index > -1) {
                        this._allNotesCache[index] = newNote;
                    } else {
                        this._allNotesCache.unshift(newNote);
                    }
                    this.editingNote = null;
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

                // 清理相关的选中/编辑状态
                if (this.selectedNoteId === id) this.selectedNoteId = null;
                if (this.editingNote?.id === id) this.editingNote = null;

            } catch (err) {
                console.error('Delete failed:', err);
                this.error = err.message;
            } finally {
                this.isSyncing = false;
            }
        },

        // --- 其他 actions 保持不变 ---
        startEditing(note) {
            this.editingNote = JSON.parse(JSON.stringify(note));
            this.selectedNoteId = note.id;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        cancelEditing() {
            this.editingNote = null;
        },

        setSearchQuery(query) {
            this.searchQuery = query;
        },

        selectNote(id) {
            this.selectedNoteId = id;
        },

        deselectNote() {
            this.selectedNoteId = null;
        },

        scrollToNote(noteId) {
            if (this._allNotesCache.some(n => n.id === noteId)) {
                if (this.searchQuery) this.setSearchQuery('');
                this.scrollToNoteId = noteId;
                this.selectedNoteId = noteId;
            } else {
                console.warn(`[NoteStore] 无法跳转：未找到 ID 为 ${noteId} 的笔记。`);
            }
        },

        insertTextIntoNote(textToInsert) {
            if (!this.editingNote) {
                alert('请先选择一篇笔记并进入编辑模式。');
                return;
            }
            this.editingNote.content += `\n\n${textToInsert}`;
        }
    }
});