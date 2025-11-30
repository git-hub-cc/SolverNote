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

        // [新增] 用于触发滚动到指定笔记的状态
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

        selectNote(id) {
            this.selectedNoteId = id === this.selectedNoteId ? null : id
        },

        /**
         * [新增] 触发滚动到指定笔记
         * @param {string} noteId 要滚动到的笔记 ID
         */
        scrollToNote(noteId) {
            // 设置状态，由 StreamTimeline 组件监听并执行滚动
            this.scrollToNoteId = noteId;

            // 同时选中该笔记
            this.selectedNoteId = noteId;
        },

        /**
         * [新增] 将文本插入到当前正在编辑的笔记中
         * @param {string} textToInsert 要插入的文本
         */
        insertTextIntoNote(textToInsert) {
            // 如果不在编辑模式，则什么都不做
            if (!this.editingNote) {
                alert('请先选择一篇笔记并进入编辑模式。');
                return;
            }

            // 在当前编辑内容的末尾追加文本
            // 简单起见，这里总是在末尾追加一个换行和新内容
            this.editingNote.content += `\n\n${textToInsert}`;

            // 由于 SmartEditor 通过 computed 属性 `editorContent` 监听 `editingNote.content`，
            // 这里的修改会自动反映到编辑器中。
        }
    }
})