// src/stores/noteStore.js

import { defineStore } from 'pinia'
import router from '@/router'
import { useUIStore } from './uiStore'

export const useNoteStore = defineStore('notes', {
    state: () => ({
        _allNotesCache: [],
        fileTree: [],
        loading: false,
        error: null,
        isSyncing: false,
        selectedNoteId: null,
        scrollToNoteId: null,
        _listeners: [],
        searchQuery: '',
        activeTagFilter: null,
        pendingDeletions: {}
    }),

    getters: {
        getNoteById: (state) => (id) => {
            if (state.pendingDeletions[id]) return undefined;
            return state._allNotesCache.find(note => note.id === id);
        },
        notes: (state) => {
            const visibleNotes = state._allNotesCache.filter(n => !state.pendingDeletions[n.id]);
            if (state.activeTagFilter) {
                return visibleNotes.filter(note => note.tags?.includes(state.activeTagFilter));
            }
            const lowerQuery = state.searchQuery.toLowerCase().trim();
            if (lowerQuery) {
                return visibleNotes.filter(note =>
                    note.title?.toLowerCase().includes(lowerQuery) ||
                    note.id.toLowerCase().includes(lowerQuery) ||
                    note.content.toLowerCase().includes(lowerQuery) ||
                    note.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
                );
            }
            return visibleNotes;
        },
        allTags: (state) => {
            const tagMap = new Map();
            state._allNotesCache
                .filter(n => !state.pendingDeletions[n.id])
                .forEach(note => {
                    note.tags?.forEach(tag => {
                        if (typeof tag === 'string' && tag.trim()) {
                            tagMap.set(tag.trim(), (tagMap.get(tag.trim()) || 0) + 1);
                        }
                    });
                });
            return Array.from(tagMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
        },
        visibleFileTree: (state) => {
            const filterTree = (nodes) => {
                return nodes
                    .filter(node => !state.pendingDeletions[node.id])
                    .map(node => ({ ...node, children: node.children ? filterTree(node.children) : [] }));
            };
            return filterTree(state.fileTree);
        }
    },

    actions: {
        setupListeners() {
            this.cleanupListeners();
            if (window.electronAPI) {
                const unsubscribe = window.electronAPI.onNotesUpdated(() => {
                    console.log('[NoteStore] 监听到外部文件变化，正在重新加载数据...');
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
            this.loading = true; this.error = null;
            try {
                if (window.electronAPI) {
                    console.log('[NoteStore] 正在从主进程获取笔记列表...');
                    this._allNotesCache = await window.electronAPI.loadNotes();
                    console.log(`[NoteStore] 成功获取 ${this._allNotesCache.length} 篇笔记。`);
                }
            } catch (err) {
                console.error('[NoteStore] 获取笔记列表失败:', err);
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },
        async fetchFileTree() {
            try {
                if (window.electronAPI) {
                    console.log('[NoteStore] 正在从主进程获取文件树...');
                    const tree = await window.electronAPI.getFileTree();
                    this.fileTree = this.sortTree(tree);
                    console.log('[NoteStore] 文件树获取并排序完成。');
                }
            } catch (err) {
                console.error('[NoteStore] 获取文件树失败:', err);
            }
        },
        sortTree(nodes) {
            if (!nodes) return [];
            return nodes.map(node => ({ ...node, children: node.children ? this.sortTree(node.children) : [] }))
                .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1);
        },

        async saveNote(payloadData) {
            this.isSyncing = true; this.error = null;
            try {
                if (!payloadData.content?.trim()) return;
                console.log(`[NoteStore] 正在保存笔记, ID: ${payloadData.id || 'new'}`);
                if (window.electronAPI) {
                    const result = await window.electronAPI.saveNote(JSON.parse(JSON.stringify(payloadData)));
                    if (result.success) {
                        console.log(`[NoteStore] 笔记保存成功, 新 ID: ${result.id}`);
                        await this.fetchNotes();
                        await this.fetchFileTree();
                    } else {
                        throw new Error(result.error);
                    }
                }
            } catch (err) {
                console.error('[NoteStore] 保存笔记失败:', err);
                this.error = '保存笔记失败';
                useUIStore().showNotification('保存笔记失败', 'error');
            } finally {
                this.isSyncing = false;
            }
        },

        requestDeleteNote(id) {
            if (!id) return;
            console.log(`[NoteStore] 请求软删除, ID: ${id}`);
            if (this.pendingDeletions[id]) clearTimeout(this.pendingDeletions[id]);

            const timerId = setTimeout(() => this._confirmDelete(id), 5000);
            this.pendingDeletions = { ...this.pendingDeletions, [id]: timerId };

            if (this.selectedNoteId === id) {
                this.selectedNoteId = null;
                if (router.currentRoute.value.name === 'note-view') router.push('/');
            }
            const noteName = id.split('/').pop() || 'Item';
            useUIStore().showUndoToast(`已删除 "${noteName}"`, id, 5000);
        },
        undoDelete(id) {
            const timerId = this.pendingDeletions[id];
            if (timerId) {
                clearTimeout(timerId);
                const newPending = { ...this.pendingDeletions };
                delete newPending[id];
                this.pendingDeletions = newPending;
                useUIStore().hideToast();
                console.log(`[NoteStore] 已撤销对 ${id} 的删除操作。`);
            }
        },
        async _confirmDelete(id) {
            console.log(`[NoteStore] 正在执行对 ${id} 的物理删除...`);
            this.isSyncing = true;
            const newPending = { ...this.pendingDeletions };
            delete newPending[id];
            this.pendingDeletions = newPending;

            try {
                if (window.electronAPI) {
                    const result = await window.electronAPI.deleteNote(id);
                    if (!result.success) throw new Error(result.error);
                }
                const index = this._allNotesCache.findIndex(n => n.id === id);
                if (index > -1) this._allNotesCache.splice(index, 1);
                await this.fetchFileTree();
                console.log(`[NoteStore] 物理删除 ${id} 成功。`);
            } catch (err) {
                console.error('[NoteStore] 物理删除失败:', err);
                useUIStore().showNotification(`删除失败: ${err.message}`, 'error');
            } finally {
                this.isSyncing = false;
            }
        },

        async createNoteInFolder(parentPath) {
            const defaultName = `Untitled-${Date.now()}.md`;
            const id = parentPath ? `${parentPath}/${defaultName}` : defaultName;
            await this.saveNote({ id, content: '# New Note\n', tags: [] });
            router.push({ name: 'note-view', params: { noteId: id } });
        },
        async createFolder(path) {
            if (window.electronAPI) {
                const res = await window.electronAPI.createFolder(path);
                if (res.success) await this.fetchFileTree();
                else useUIStore().showNotification('创建文件夹失败: ' + res.error, 'error');
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
                } else useUIStore().showNotification('重命名失败: ' + res.error, 'error');
            }
        },
        async movePath(sourceId, targetDir) {
            if (window.electronAPI) {
                const res = await window.electronAPI.movePath(sourceId, targetDir);
                if (res.success) {
                    await this.fetchNotes();
                    await this.fetchFileTree();
                    const newId = targetDir ? `${targetDir}/${sourceId.split('/').pop()}` : sourceId.split('/').pop();
                    if (this.selectedNoteId === sourceId) {
                        router.replace({ name: 'note-view', params: { noteId: newId } });
                    }
                } else useUIStore().showNotification('移动失败: ' + res.error, 'error');
            }
        },

        setSearchQuery(query) {
            this.searchQuery = query;
            this.activeTagFilter = null;
        },
        setActiveTagFilter(tagName) {
            this.activeTagFilter = tagName;
            this.searchQuery = '';
        },
        clearFilters() {
            this.searchQuery = '';
            this.activeTagFilter = null;
        },

        selectNote(id) { this.selectedNoteId = id; },
        deselectNote() { this.selectedNoteId = null; },
        scrollToNote(noteId) {
            if (this._allNotesCache.some(n => n.id === noteId)) {
                this.clearFilters();
                this.scrollToNoteId = noteId;
                this.selectedNoteId = noteId;
            }
        }
    }
});