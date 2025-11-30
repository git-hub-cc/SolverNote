import { defineStore } from 'pinia'

// 模拟数据 (Fallback for Browser Dev)
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
        content: '- [x] 任务 A\n- [ ] 任务 B\n\n支持标准 Markdown 渲染了。',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        tags: ['todo'],
        title: '待办事项'
    }
]

export const useNoteStore = defineStore('notes', {
    state: () => ({
        notes: [],
        loading: false,
        error: null,
        searchQuery: '',
        selectedNoteId: null,
        editingNote: null,
        isSyncing: false,

        // 用于触发滚动到指定笔记的状态
        scrollToNoteId: null
    }),

    getters: {
        activeNote: (state) => state.notes.find(n => n.id === state.selectedNoteId),
        isEditMode: (state) => !!state.editingNote,
        allTags: (state) => {
            const tagMap = new Map()
            state.notes.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => {
                        if (!tag || typeof tag !== 'string') return
                        const normalizedTag = tag.trim()
                        if (!normalizedTag) return
                        const count = tagMap.get(normalizedTag) || 0
                        tagMap.set(normalizedTag, count + 1)
                    })
                }
            })
            return Array.from(tagMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
        }
    },

    actions: {
        async fetchNotes() {
            this.loading = true
            this.error = null
            try {
                if (window.electronAPI) {
                    if (this.searchQuery) {
                        this.notes = await window.electronAPI.searchNotes(this.searchQuery)
                    } else {
                        this.notes = await window.electronAPI.loadNotes()
                    }
                } else {
                    console.warn('Electron API not found, using mock data.')
                    await new Promise(r => setTimeout(r, 300))
                    if (this.notes.length === 0) {
                        this.notes = MOCK_NOTES
                    }
                }
            } catch (err) {
                console.error('Failed to fetch notes:', err)
                this.error = err.message
            } finally {
                this.loading = false
            }
        },

        async saveNote(payloadData) {
            let content, tags;
            if (typeof payloadData === 'string') {
                content = payloadData;
                tags = [];
            } else {
                content = payloadData.content;
                tags = payloadData.tags || [];
            }
            if (!content || !content.trim()) return

            this.isSyncing = true
            try {
                const payload = { content, tags }
                if (this.editingNote) {
                    payload.id = this.editingNote.id
                    if (!payloadData.tags && this.editingNote.tags) {
                        payload.tags = [...this.editingNote.tags]
                    }
                }

                if (window.electronAPI) {
                    const cleanPayload = JSON.parse(JSON.stringify(payload))
                    const result = await window.electronAPI.saveNote(cleanPayload)
                    if (result.success) {
                        this.editingNote = null
                        await this.fetchNotes()
                    } else {
                        throw new Error(result.error)
                    }
                } else {
                    if (this.editingNote) {
                        const target = this.notes.find(n => n.id === this.editingNote.id)
                        if (target) {
                            target.content = content
                            target.tags = tags
                            target.timestamp = new Date().toISOString()
                        }
                    } else {
                        this.notes.unshift({
                            id: `mock-${Date.now()}.md`,
                            content,
                            timestamp: new Date().toISOString(),
                            tags: tags
                        })
                    }
                    this.editingNote = null
                }
            } catch (err) {
                console.error('Save failed:', err)
                this.error = 'Failed to save note'
            } finally {
                this.isSyncing = false
            }
        },

        async deleteNote(id) {
            if (!id) return
            if (!confirm('确定要删除这条笔记吗？')) return

            this.isSyncing = true
            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.deleteNote(id)
                    if (result.success) {
                        this.notes = this.notes.filter(n => n.id !== id)
                        if (this.selectedNoteId === id) this.selectedNoteId = null
                        if (this.editingNote?.id === id) this.editingNote = null
                    } else {
                        throw new Error(result.error)
                    }
                } else {
                    this.notes = this.notes.filter(n => n.id !== id)
                }
            } catch (err) {
                console.error('Delete failed:', err)
                this.error = err.message
            } finally {
                this.isSyncing = false
            }
        },

        startEditing(note) {
            this.editingNote = JSON.parse(JSON.stringify(note))
            this.selectedNoteId = note.id
            window.scrollTo({ top: 0, behavior: 'smooth' })
        },

        cancelEditing() {
            this.editingNote = null
        },

        setSearchQuery(query) {
            this.searchQuery = query
            this.fetchNotes()
        },

        /**
         * [修改] 选中指定的笔记
         * 移除了 "toggle" 逻辑，现在无论点击多少次，只要 ID 相同，
         * 都会保持选中状态。这防止了意外取消选中的情况。
         *
         * @param {string} id 要选中的笔记 ID
         */
        selectNote(id) {
            this.selectedNoteId = id
        },

        /**
         * [新增] 取消当前选中
         * 用于在点击空白区域时调用，明确将状态重置为 null。
         */
        deselectNote() {
            this.selectedNoteId = null
        },

        async scrollToNote(noteId) {
            let targetExists = this.notes.some(n => n.id === noteId);

            if (!targetExists && this.searchQuery) {
                console.log(`[NoteStore] 目标笔记 ${noteId} 不在当前搜索结果中，正在切换回全量列表...`);
                this.searchQuery = '';
                await this.fetchNotes();
                targetExists = this.notes.some(n => n.id === noteId);
            }

            if (targetExists) {
                this.scrollToNoteId = noteId;
                this.selectedNoteId = noteId;
            } else {
                console.warn(`[NoteStore] 无法跳转：即使在全量列表中也未找到 ID 为 ${noteId} 的笔记。`);
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
})