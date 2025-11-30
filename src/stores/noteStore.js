import { defineStore } from 'pinia'

// 模拟数据 (Fallback for Browser Dev)
const MOCK_NOTES = [
    {
        id: 'mock-1.md',
        content: '**欢迎使用 SolverNote**\n这是一个模拟数据。\n\n> 提示：请在 Electron 中启动以启用文件读写。',
        timestamp: new Date().toISOString(),
        tags: ['welcome']
    },
    {
        id: 'mock-2.md',
        content: '- [x] 任务 A\n- [ ] 任务 B\n\n支持标准 Markdown 渲染了。',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        tags: ['todo']
    }
]

export const useNoteStore = defineStore('notes', {
    state: () => ({
        notes: [],
        loading: false,
        error: null,
        searchQuery: '',

        // 当前选中的笔记 ID (用于右侧 AI 分析)
        selectedNoteId: null,

        // 当前正在编辑的笔记对象 (用于编辑器回填)
        // 如果为 null，表示编辑器处于"新建模式"
        editingNote: null,

        // UI 状态
        isSyncing: false // 保存/删除时的 Loading 状态
    }),

    getters: {
        activeNote: (state) => state.notes.find(n => n.id === state.selectedNoteId),

        // 辅助判断当前编辑器是否处于"修改模式"
        isEditMode: (state) => !!state.editingNote,

        /**
         * [新增] 获取全量标签统计
         * @returns {Array} [{ name: 'tag', count: 10 }, ...] 按数量降序
         */
        allTags: (state) => {
            const tagMap = new Map()

            // 遍历所有笔记
            state.notes.forEach(note => {
                // 鲁棒性检查：确保 tags 存在且为数组
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => {
                        // 过滤空标签
                        if (!tag || typeof tag !== 'string') return

                        const normalizedTag = tag.trim()
                        if (!normalizedTag) return

                        const count = tagMap.get(normalizedTag) || 0
                        tagMap.set(normalizedTag, count + 1)
                    })
                }
            })

            // 转换为数组并排序
            return Array.from(tagMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
        }
    },

    actions: {
        /**
         * 初始化加载笔记
         */
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
                    // Browser Mode Mock
                    console.warn('Electron API not found, using mock data.')
                    await new Promise(r => setTimeout(r, 300))
                    // 如果已经是 mock 数据，就不覆盖了，防止开发时刷新丢失数据
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

        /**
         * 保存笔记 (新建 OR 更新)
         * @param {Object|string} payloadData - { content, tags } 对象 或 纯文本内容
         */
        async saveNote(payloadData) {
            // 参数归一化处理
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
                // 构造保存载荷
                const payload = {
                    content,
                    tags: tags // 使用前端传入的标签
                }

                // 核心判断：如果有 editingNote，说明是更新模式，需要带上 ID
                if (this.editingNote) {
                    payload.id = this.editingNote.id
                    // 如果前端没有传 tags (例如没改 UI), 则保留原有的 tags
                    if (!payloadData.tags && this.editingNote.tags) {
                        payload.tags = [...this.editingNote.tags]
                    }
                }

                if (window.electronAPI) {
                    // 🛡️ 去除 Vue Proxy 代理，防止 "An object could not be cloned" 错误
                    const cleanPayload = JSON.parse(JSON.stringify(payload))

                    const result = await window.electronAPI.saveNote(cleanPayload)

                    if (result.success) {
                        // 保存成功后：
                        // 1. 退出编辑模式
                        this.editingNote = null
                        // 2. 刷新列表
                        await this.fetchNotes()
                    } else {
                        throw new Error(result.error)
                    }
                } else {
                    // Mock Save
                    if (this.editingNote) {
                        const target = this.notes.find(n => n.id === this.editingNote.id)
                        if (target) {
                            target.content = content
                            target.tags = tags
                            target.timestamp = new Date().toISOString() // Mock 更新时间
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

        /**
         * 删除笔记
         */
        async deleteNote(id) {
            if (!id) return

            // 简单确认
            if (!confirm('Are you sure you want to delete this note?')) return

            this.isSyncing = true
            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.deleteNote(id)
                    if (result.success) {
                        // 乐观更新：直接从前端数组移除，无需重载列表
                        this.notes = this.notes.filter(n => n.id !== id)
                        // 如果删除的是当前选中的或正在编辑的，重置状态
                        if (this.selectedNoteId === id) this.selectedNoteId = null
                        if (this.editingNote?.id === id) this.editingNote = null
                    } else {
                        throw new Error(result.error)
                    }
                } else {
                    // Mock Delete
                    this.notes = this.notes.filter(n => n.id !== id)
                }
            } catch (err) {
                console.error('Delete failed:', err)
                this.error = err.message
            } finally {
                this.isSyncing = false
            }
        },

        /**
         * 进入编辑模式
         */
        startEditing(note) {
            // 深拷贝一份，防止编辑过程中的修改直接污染列表展示
            this.editingNote = JSON.parse(JSON.stringify(note))

            // 选中它
            this.selectedNoteId = note.id

            // 滚动到顶部
            window.scrollTo({ top: 0, behavior: 'smooth' })
        },

        /**
         * 取消编辑模式
         */
        cancelEditing() {
            this.editingNote = null
        },

        setSearchQuery(query) {
            this.searchQuery = query
            this.fetchNotes()
        },

        selectNote(id) {
            this.selectedNoteId = id === this.selectedNoteId ? null : id
        }
    }
})