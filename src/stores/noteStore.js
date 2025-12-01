import { defineStore } from 'pinia'
import router from '@/router'

// 模拟数据 (开发回退)
const MOCK_NOTES = [
    {
        id: 'mock-1.md',
        content: '**Welcome to SolverNote**',
        timestamp: new Date().toISOString(),
        tags: ['welcome'],
        title: 'Welcome Note'
    }
]

export const useNoteStore = defineStore('notes', {
    state: () => ({
        /**
         * 扁平笔记列表（用于搜索和内容展示）
         */
        _allNotesCache: [],

        /**
         * [Phase 2 新增] 完整的文件树结构
         */
        fileTree: [],

        loading: false,
        error: null,
        searchQuery: '',
        isSyncing: false,

        selectedNoteId: null,
        scrollToNoteId: null,

        _listeners: []
    }),

    getters: {
        getNoteById: (state) => {
            return (id) => state._allNotesCache.find(note => note.id === id);
        },

        notes: (state) => {
            if (!state.searchQuery || state.searchQuery.trim() === '') {
                return state._allNotesCache;
            }
            const lowerQuery = state.searchQuery.toLowerCase().trim();
            return state._allNotesCache.filter(note => {
                const inTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
                const inId = note.id.toLowerCase().includes(lowerQuery);
                const inContent = note.content.toLowerCase().includes(lowerQuery);
                const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
                return inTitle || inId || inContent || inTags;
            });
        },

        allTags: (state) => {
            const tagMap = new Map();
            state._allNotesCache.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => {
                        if (typeof tag !== 'string' || !tag.trim()) return;
                        tagMap.set(tag.trim(), (tagMap.get(tag.trim()) || 0) + 1);
                    });
                }
            });
            return Array.from(tagMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
        }
    },

    actions: {
        setupListeners() {
            this.cleanupListeners();
            if (window.electronAPI) {
                const unsubscribe = window.electronAPI.onNotesUpdated(() => {
                    console.log('[Store] Notes updated externally, reloading...');
                    this.fetchNotes();
                    this.fetchFileTree(); // 同时刷新树
                });
                this._listeners.push(unsubscribe);
            }
        },

        cleanupListeners() {
            this._listeners.forEach(unsub => unsub());
            this._listeners = [];
        },

        async fetchNotes() {
            this.loading = true;
            this.error = null;
            try {
                if (window.electronAPI) {
                    this._allNotesCache = await window.electronAPI.loadNotes();
                } else {
                    console.warn('Electron API not found, using mock data.');
                    await new Promise(r => setTimeout(r, 300));
                    if (this._allNotesCache.length === 0) this._allNotesCache = MOCK_NOTES;
                }
            } catch (err) {
                console.error('Failed to fetch notes:', err);
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },

        /**
         * [Phase 2 新增] 获取文件树
         */
        async fetchFileTree() {
            try {
                if (window.electronAPI) {
                    const tree = await window.electronAPI.getFileTree();
                    this.fileTree = this.sortTree(tree);
                }
            } catch (err) {
                console.error('Failed to fetch file tree:', err);
            }
        },

        /**
         * [辅助] 对树进行排序：文件夹在前，文件名 A-Z
         */
        sortTree(nodes) {
            if (!nodes) return [];
            return nodes.map(node => ({
                ...node,
                children: node.children ? this.sortTree(node.children) : []
            })).sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });
        },

        async saveNote(payloadData) {
            this.isSyncing = true;
            this.error = null;
            try {
                if (!payloadData.content || !payloadData.content.trim()) return;

                if (window.electronAPI) {
                    const cleanPayload = JSON.parse(JSON.stringify(payloadData));
                    const result = await window.electronAPI.saveNote(cleanPayload);

                    if (result.success) {
                        await this.fetchNotes();
                        await this.fetchFileTree(); // 保存新文件后刷新树
                    } else {
                        throw new Error(result.error);
                    }
                }
            } catch (err) {
                console.error('Save failed:', err);
                this.error = 'Failed to save note';
            } finally {
                this.isSyncing = false;
            }
        },

        async deleteNote(id) {
            if (!id) return;
            this.isSyncing = true;
            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.deleteNote(id);
                    if (!result.success) throw new Error(result.error);
                }

                // 乐观 UI 更新
                const index = this._allNotesCache.findIndex(n => n.id === id);
                if (index > -1) this._allNotesCache.splice(index, 1);
                if (this.selectedNoteId === id) {
                    this.selectedNoteId = null;
                    router.push('/'); // 如果删除了当前查看的笔记，回主页
                }

                await this.fetchFileTree(); // 刷新树
            } catch (err) {
                console.error('Delete failed:', err);
                this.error = err.message;
            } finally {
                this.isSyncing = false;
            }
        },

        // --- 文件操作 Actions ---

        /**
         * [Phase 2 新增] 在指定文件夹下创建新笔记
         */
        async createNoteInFolder(parentPath) {
            const defaultName = `Untitled-${Date.now()}.md`;
            // 如果有父目录，拼接路径；否则直接用文件名
            const id = parentPath ? `${parentPath}/${defaultName}` : defaultName;

            // 构造一个空的笔记对象
            const newNote = {
                id: id,
                content: '# New Note\nStart writing...',
                tags: []
            };

            await this.saveNote(newNote);

            // 导航到新笔记
            router.push({ name: 'note-view', params: { noteId: id } });
        },

        /**
         * [Phase 2 新增] 创建文件夹
         */
        async createFolder(path) {
            if (window.electronAPI) {
                const res = await window.electronAPI.createFolder(path);
                if (res.success) {
                    await this.fetchFileTree();
                } else {
                    alert('Failed to create folder: ' + res.error);
                }
            }
        },

        /**
         * [Phase 2 新增] 重命名
         */
        async renamePath(oldPath, newPath) {
            if (window.electronAPI) {
                const res = await window.electronAPI.renamePath(oldPath, newPath);
                if (res.success) {
                    // 如果重命名的是当前打开的笔记，需要更新路由
                    if (this.selectedNoteId === oldPath) {
                        this.selectedNoteId = newPath;
                        router.replace({ name: 'note-view', params: { noteId: newPath } });
                    }
                    await this.fetchNotes();
                    await this.fetchFileTree();
                } else {
                    alert('Rename failed: ' + res.error);
                }
            }
        },

        /**
         * [Phase 2 新增] 移动文件
         */
        async movePath(sourceId, targetDir) {
            if (window.electronAPI) {
                const res = await window.electronAPI.movePath(sourceId, targetDir);
                if (res.success) {
                    await this.fetchNotes();
                    await this.fetchFileTree();

                    // 计算新 ID 并在需要时跳转
                    const fileName = sourceId.split('/').pop();
                    const newId = targetDir ? `${targetDir}/${fileName}` : fileName;

                    if (this.selectedNoteId === sourceId) {
                        router.replace({ name: 'note-view', params: { noteId: newId } });
                    }
                } else {
                    alert('Move failed: ' + res.error);
                }
            }
        },

        setSearchQuery(query) { this.searchQuery = query; },
        selectNote(id) { this.selectedNoteId = id; },
        deselectNote() { this.selectedNoteId = null; },
        scrollToNote(noteId) {
            if (this._allNotesCache.some(n => n.id === noteId)) {
                if (this.searchQuery) this.setSearchQuery('');
                this.scrollToNoteId = noteId;
                this.selectedNoteId = noteId;
            }
        }
    }
});