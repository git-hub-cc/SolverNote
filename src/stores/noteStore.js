// src/stores/noteStore.js

import { defineStore } from 'pinia'
import router from '@/router'
import { useUIStore } from './uiStore' // 引入 UI Store 用于显示 Toast

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
        _allNotesCache: [],
        fileTree: [],
        loading: false,
        error: null,
        searchQuery: '',
        isSyncing: false,
        selectedNoteId: null,
        scrollToNoteId: null,
        _listeners: [],

        /**
         * 待删除队列
         * 存储结构: { [noteId]: timerId }
         * 用于追踪哪些笔记处于"软删除"状态（5秒反悔期）
         */
        pendingDeletions: {}
    }),

    getters: {
        getNoteById: (state) => {
            return (id) => {
                // 如果笔记在待删除队列中，视为已不存在
                if (state.pendingDeletions[id]) return undefined;
                return state._allNotesCache.find(note => note.id === id);
            }
        },

        notes: (state) => {
            // 过滤掉处于待删除状态的笔记
            const visibleNotes = state._allNotesCache.filter(n => !state.pendingDeletions[n.id]);

            if (!state.searchQuery || state.searchQuery.trim() === '') {
                return visibleNotes;
            }
            const lowerQuery = state.searchQuery.toLowerCase().trim();
            return visibleNotes.filter(note => {
                const inTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
                const inId = note.id.toLowerCase().includes(lowerQuery);
                const inContent = note.content.toLowerCase().includes(lowerQuery);
                const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
                return inTitle || inId || inContent || inTags;
            });
        },

        allTags: (state) => {
            const tagMap = new Map();
            state._allNotesCache
                .filter(n => !state.pendingDeletions[n.id])
                .forEach(note => {
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
        },

        /**
         * 可见的文件树
         * 递归过滤掉待删除的文件或文件夹
         */
        visibleFileTree: (state) => {
            const filterTree = (nodes) => {
                return nodes
                    .filter(node => !state.pendingDeletions[node.id]) // 过滤自身
                    .map(node => ({
                        ...node,
                        children: node.children ? filterTree(node.children) : [] // 递归过滤子节点
                    }));
            };
            return filterTree(state.fileTree);
        }
    },

    actions: {
        setupListeners() {
            this.cleanupListeners();
            if (window.electronAPI) {
                const unsubscribe = window.electronAPI.onNotesUpdated(() => {
                    console.log('[Store] Notes updated externally, reloading...');
                    this.fetchNotes();
                    this.fetchFileTree();
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
                        await this.fetchFileTree();
                    } else {
                        throw new Error(result.error);
                    }
                }
            } catch (err) {
                console.error('Save failed:', err);
                this.error = 'Failed to save note';
                // [新增] 显示错误通知
                const uiStore = useUIStore();
                uiStore.showNotification('Failed to save note', 'error');
            } finally {
                this.isSyncing = false;
            }
        },

        // --- 删除逻辑 ---

        async requestDeleteNote(id) {
            if (!id) return;

            // 1. 如果该文件已经在等待删除中，先取消旧的定时器（防抖）
            if (this.pendingDeletions[id]) {
                clearTimeout(this.pendingDeletions[id]);
            }

            // 2. 启动真正的删除定时器
            const timerId = setTimeout(() => {
                this._confirmDelete(id); // 5秒后执行真删除
            }, 5000); // 5秒倒计时

            // 3. 更新状态，UI 立即隐藏该项
            this.pendingDeletions = {
                ...this.pendingDeletions,
                [id]: timerId
            };

            // 4. 处理选中状态
            if (this.selectedNoteId === id) {
                this.selectedNoteId = null;
                if (router.currentRoute.value.name === 'note-view') {
                    router.push('/');
                }
            }

            // 5. 显示撤销提示框 (Undo Toast)
            const uiStore = useUIStore();
            const noteName = id.split('/').pop() || 'Item';
            uiStore.showUndoToast(`Deleted "${noteName}"`, id, 5000);
        },

        undoDelete(id) {
            const timerId = this.pendingDeletions[id];
            if (timerId) {
                // 1. 阻止真删除
                clearTimeout(timerId);

                // 2. 从待删除队列中移除，UI 会立即重新渲染出该笔记
                const newPending = { ...this.pendingDeletions };
                delete newPending[id];
                this.pendingDeletions = newPending;

                // 3. 关闭提示框
                const uiStore = useUIStore();
                uiStore.hideToast();
            }
        },

        async _confirmDelete(id) {
            console.log(`[Store] Executing hard delete for: ${id}`);
            this.isSyncing = true;

            const newPending = { ...this.pendingDeletions };
            delete newPending[id];
            this.pendingDeletions = newPending;

            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.deleteNote(id);
                    if (!result.success) throw new Error(result.error);
                }

                // 乐观更新
                const index = this._allNotesCache.findIndex(n => n.id === id);
                if (index > -1) this._allNotesCache.splice(index, 1);

                // 刷新树结构
                await this.fetchFileTree();

            } catch (err) {
                console.error('Hard delete failed:', err);
                this.error = `Failed to delete: ${err.message}`;
                // [新增] 删除失败通知
                const uiStore = useUIStore();
                uiStore.showNotification(`Delete failed: ${err.message}`, 'error');
            } finally {
                this.isSyncing = false;
            }
        },

        async deleteNote(id) {
            return this.requestDeleteNote(id);
        },

        // --- 文件操作 ---

        async createNoteInFolder(parentPath) {
            const defaultName = `Untitled-${Date.now()}.md`;
            const id = parentPath ? `${parentPath}/${defaultName}` : defaultName;
            const newNote = { id: id, content: '# New Note\nStart writing...', tags: [] };
            await this.saveNote(newNote);
            router.push({ name: 'note-view', params: { noteId: id } });
        },

        async createFolder(path) {
            if (window.electronAPI) {
                const res = await window.electronAPI.createFolder(path);
                if (res.success) {
                    await this.fetchFileTree();
                } else {
                    // [修改] 使用 Toast 替代 alert
                    const uiStore = useUIStore();
                    uiStore.showNotification('Failed to create folder: ' + res.error, 'error');
                }
            }
        },

        async renamePath(oldPath, newPath) {
            if (window.electronAPI) {
                const res = await window.electronAPI.renamePath(oldPath, newPath);
                if (res.success) {
                    if (this.selectedNoteId === oldPath) {
                        this.selectedNoteId = newPath;
                        router.replace({ name: 'note-view', params: { noteId: newPath } });
                    }
                    await this.fetchNotes();
                    await this.fetchFileTree();
                } else {
                    // [修改] 使用 Toast 替代 alert
                    const uiStore = useUIStore();
                    uiStore.showNotification('Rename failed: ' + res.error, 'error');
                }
            }
        },

        async movePath(sourceId, targetDir) {
            if (window.electronAPI) {
                const res = await window.electronAPI.movePath(sourceId, targetDir);
                if (res.success) {
                    await this.fetchNotes();
                    await this.fetchFileTree();
                    const fileName = sourceId.split('/').pop();
                    const newId = targetDir ? `${targetDir}/${fileName}` : fileName;
                    if (this.selectedNoteId === sourceId) {
                        router.replace({ name: 'note-view', params: { noteId: newId } });
                    }
                } else {
                    // [修改] 使用 Toast 替代 alert
                    const uiStore = useUIStore();
                    uiStore.showNotification('Move failed: ' + res.error, 'error');
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