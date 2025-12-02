// src/stores/noteStore.js

import { defineStore } from 'pinia'
import router from '@/router'
import { useUIStore } from './uiStore'

// 模拟数据 (用于在非 Electron 环境下开发或测试)
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
        isSyncing: false,
        selectedNoteId: null,
        scrollToNoteId: null,
        _listeners: [],

        // --- 核心修改区域 ---
        // 1. [状态] 文本搜索查询 (职责不变)
        searchQuery: '',
        // 2. [新增状态] 激活的标签过滤器。用于精确筛选，与 searchQuery 互斥。
        //    值为 null 表示未按标签筛选，值为字符串 (如 'vue') 表示正在筛选该标签。
        activeTagFilter: null,

        /**
         * 待删除队列
         * 存储结构: { [noteId]: timerId }
         * 用于追踪哪些笔记处于"软删除"状态（有 5 秒的反悔期）。
         */
        pendingDeletions: {}
    }),

    getters: {
        getNoteById: (state) => {
            return (id) => {
                // 如果笔记在待删除队列中，视为已不存在，返回 undefined
                if (state.pendingDeletions[id]) return undefined;
                return state._allNotesCache.find(note => note.id === id);
            }
        },

        // [核心重构] notes Getter，现在可以智能区分筛选模式
        notes: (state) => {
            // 首先，从缓存中过滤掉所有待删除的笔记
            const visibleNotes = state._allNotesCache.filter(n => !state.pendingDeletions[n.id]);

            // --- 筛选逻辑 ---

            // 优先级 1: 检查是否存在激活的标签过滤器
            if (state.activeTagFilter) {
                // 如果有，则执行精确的标签匹配
                return visibleNotes.filter(note =>
                    note.tags && note.tags.includes(state.activeTagFilter)
                );
            }

            // 优先级 2: 如果没有标签过滤器，检查是否存在文本搜索查询
            const lowerQuery = state.searchQuery.toLowerCase().trim();
            if (lowerQuery) {
                // 如果有，执行模糊搜索
                return visibleNotes.filter(note => {
                    const inTitle = note.title && note.title.toLowerCase().includes(lowerQuery);
                    const inId = note.id.toLowerCase().includes(lowerQuery);
                    const inContent = note.content.toLowerCase().includes(lowerQuery);
                    const inTags = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
                    return inTitle || inId || inContent || inTags;
                });
            }

            // 默认情况: 如果没有任何筛选条件，返回所有可见笔记
            return visibleNotes;
        },

        allTags: (state) => {
            const tagMap = new Map();
            // 确保从完整的、未被软删除的笔记列表中统计标签
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

        visibleFileTree: (state) => {
            const filterTree = (nodes) => {
                return nodes
                    .filter(node => !state.pendingDeletions[node.id]) // 过滤自身
                    .map(node => ({
                        ...node,
                        // 递归过滤子节点
                        children: node.children ? filterTree(node.children) : []
                    }));
            };
            return filterTree(state.fileTree);
        }
    },

    actions: {
        // --- 监听与初始化 (无变化) ---
        setupListeners() { /* ... 代码无变化 ... */
            this.cleanupListeners();
            if (window.electronAPI) {
                const unsubscribe = window.electronAPI.onNotesUpdated(() => {
                    console.log('[Store] 监听到外部文件变化，正在重新加载...');
                    this.fetchNotes();
                    this.fetchFileTree();
                });
                this._listeners.push(unsubscribe);
            }
        },
        cleanupListeners() { /* ... 代码无变化 ... */
            this._listeners.forEach(unsub => unsub());
            this._listeners = [];
        },

        // --- 数据获取 (无变化) ---
        async fetchNotes() { /* ... 代码无变化 ... */
            this.loading = true;
            this.error = null;
            try {
                if (window.electronAPI) {
                    this._allNotesCache = await window.electronAPI.loadNotes();
                } else {
                    console.warn('Electron API 未找到，使用模拟数据。');
                    await new Promise(r => setTimeout(r, 300));
                    if (this._allNotesCache.length === 0) this._allNotesCache = MOCK_NOTES;
                }
            } catch (err) {
                console.error('获取笔记列表失败:', err);
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },
        async fetchFileTree() { /* ... 代码无变化 ... */
            try {
                if (window.electronAPI) {
                    const tree = await window.electronAPI.getFileTree();
                    this.fileTree = this.sortTree(tree);
                }
            } catch (err) {
                console.error('获取文件树失败:', err);
            }
        },
        sortTree(nodes) { /* ... 代码无变化 ... */
            if (!nodes) return [];
            return nodes.map(node => ({
                ...node,
                children: node.children ? this.sortTree(node.children) : []
            })).sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });
        },

        // --- 数据修改 (无变化) ---
        async saveNote(payloadData) { /* ... 代码无变化 ... */
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
                console.error('保存失败:', err);
                this.error = '保存笔记失败';
                const uiStore = useUIStore();
                uiStore.showNotification('保存笔记失败', 'error');
            } finally {
                this.isSyncing = false;
            }
        },

        // --- 删除逻辑 (无变化) ---
        async requestDeleteNote(id) { /* ... 代码无变化 ... */
            if (!id) return;
            if (this.pendingDeletions[id]) {
                clearTimeout(this.pendingDeletions[id]);
            }
            const timerId = setTimeout(() => {
                this._confirmDelete(id);
            }, 5000);
            this.pendingDeletions = {
                ...this.pendingDeletions,
                [id]: timerId
            };
            if (this.selectedNoteId === id) {
                this.selectedNoteId = null;
                if (router.currentRoute.value.name === 'note-view') {
                    router.push('/');
                }
            }
            const uiStore = useUIStore();
            const noteName = id.split('/').pop() || 'Item';
            uiStore.showUndoToast(`已删除 "${noteName}"`, id, 5000);
        },
        undoDelete(id) { /* ... 代码无变化 ... */
            const timerId = this.pendingDeletions[id];
            if (timerId) {
                clearTimeout(timerId);
                const newPending = { ...this.pendingDeletions };
                delete newPending[id];
                this.pendingDeletions = newPending;
                const uiStore = useUIStore();
                uiStore.hideToast();
            }
        },
        async _confirmDelete(id) { /* ... 代码无变化 ... */
            console.log(`[Store] 正在执行对 ${id} 的物理删除操作`);
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

            } catch (err) {
                console.error('物理删除失败:', err);
                this.error = `删除失败: ${err.message}`;
                const uiStore = useUIStore();
                uiStore.showNotification(`删除失败: ${err.message}`, 'error');
            } finally {
                this.isSyncing = false;
            }
        },

        // --- 文件操作 (无变化) ---
        async createNoteInFolder(parentPath) { /* ... 代码无变化 ... */
            const defaultName = `Untitled-${Date.now()}.md`;
            const id = parentPath ? `${parentPath}/${defaultName}` : defaultName;
            const newNote = { id: id, content: '# New Note\nStart writing...', tags: [] };
            await this.saveNote(newNote);
            router.push({ name: 'note-view', params: { noteId: id } });
        },
        async createFolder(path) { /* ... 代码无变化 ... */
            if (window.electronAPI) {
                const res = await window.electronAPI.createFolder(path);
                if (res.success) {
                    await this.fetchFileTree();
                } else {
                    const uiStore = useUIStore();
                    uiStore.showNotification('创建文件夹失败: ' + res.error, 'error');
                }
            }
        },
        async renamePath(oldPath, newPath) { /* ... 代码无变化 ... */
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
                    const uiStore = useUIStore();
                    uiStore.showNotification('重命名失败: ' + res.error, 'error');
                }
            }
        },
        async movePath(sourceId, targetDir) { /* ... 代码无变化 ... */
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
                    const uiStore = useUIStore();
                    uiStore.showNotification('移动失败: ' + res.error, 'error');
                }
            }
        },

        // --- 筛选 Actions (核心修改区域) ---

        /**
         * [修改] 设置文本搜索查询。
         * @param {string} query - 用户输入的搜索文本。
         */
        setSearchQuery(query) {
            this.searchQuery = query;
            // 关键：进行文本搜索时，必须清除标签过滤器，确保两者互斥。
            this.activeTagFilter = null;
        },

        /**
         * [新增] 设置激活的标签过滤器。
         * @param {string | null} tagName - 要筛选的标签名，或 null 以清除。
         */
        setActiveTagFilter(tagName) {
            this.activeTagFilter = tagName;
            // 关键：进行标签筛选时，必须清除文本搜索查询，确保两者互斥。
            this.searchQuery = '';
        },

        /**
         * [新增] 清除所有筛选条件。
         * 在返回主页或用户主动清除时调用。
         */
        clearFilters() {
            this.searchQuery = '';
            this.activeTagFilter = null;
        },


        // --- UI 交互 (无变化) ---
        selectNote(id) { this.selectedNoteId = id; },
        deselectNote() { this.selectedNoteId = null; },
        scrollToNote(noteId) {
            if (this._allNotesCache.some(n => n.id === noteId)) {
                // 修改：滚动前清空所有过滤器，以确保目标笔记可见
                this.clearFilters();
                this.scrollToNoteId = noteId;
                this.selectedNoteId = noteId;
            }
        }
    }
});