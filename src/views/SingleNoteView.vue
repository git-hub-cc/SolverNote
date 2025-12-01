<template>
  <div class="single-note-view">
    <!-- 状态一: 正在加载笔记 -->
    <div v-if="isLoading" class="state-container">
      <div class="loading-spinner"></div>
      <span>Loading note...</span>
    </div>

    <!-- 状态二: 笔记未找到 -->
    <div v-else-if="!note" class="state-container empty">
      <p class="error-title">:( Note Not Found</p>
      <p>Could not find note with ID "{{ noteId }}".</p>
      <p>It may have been deleted or moved.</p>
      <router-link to="/" class="back-home-link">Return to Home</router-link>
    </div>

    <!-- 状态三: 笔记内容展示 (核心视图) -->
    <div v-else class="note-content-wrapper">
      <article class="note-article">
        <!-- 笔记操作头部 -->
        <header class="note-actions-header">
          <div class="header-placeholder"></div>
          <div class="actions-group">
            <button v-if="isEditing" class="action-btn" @click="handleCancelEdit" title="Cancel changes">
              <XIcon class="icon" />
              <span>Cancel</span>
            </button>
            <button v-else class="action-btn" @click="enterEditMode" title="Edit note">
              <Edit3Icon class="icon" />
              <span>Edit</span>
            </button>
            <button class="action-btn danger" @click="handleDelete" title="Delete note">
              <Trash2Icon class="icon" />
              <span>Delete</span>
            </button>
          </div>
        </header>

        <!-- 笔记正文区域 -->
        <div class="note-body">
          <!-- 编辑模式: 显示 SmartEditor 组件 -->
          <SmartEditor
              v-if="isEditing"
              :initial-content="note.content"
              :initial-tags="note.tags || []"
              :is-edit-mode="true"
              :unlimited-height="true"
              @save="handleUpdateAndExit"
              @cancel="handleCancelEdit"
          />

          <!-- 预览模式: 显示渲染后的 HTML -->
          <div v-else class="preview-mode-content">
            <div class="note-meta-header">
              <h1 class="note-title">{{ note.title || 'Untitled Note' }}</h1>
              <div class="note-meta">
                <span>{{ formattedTimestamp }}</span>
                <template v-if="note.tags && note.tags.length > 0">
                  <span class="meta-divider">·</span>
                  <div class="tags-list">
                    <span v-for="tag in note.tags" :key="tag" class="tag-chip">#{{ tag }}</span>
                  </div>
                </template>
              </div>
            </div>
            <div class="markdown-body" v-html="renderedContent"></div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNoteStore } from '@/stores/noteStore';
import { useSolverStore } from '@/stores/solverStore';
import { renderMarkdown } from '@/utils/markdownRenderer';
import dayjs from 'dayjs';
import { Edit3 as Edit3Icon, Trash2 as Trash2Icon, X as XIcon } from 'lucide-vue-next';
import SmartEditor from '@/components/editor/SmartEditor.vue';

// --- Props, Store, Router ---
const props = defineProps({
  noteId: { type: String, required: true }
});
const noteStore = useNoteStore();
const solverStore = useSolverStore();
const router = useRouter();
const route = useRoute();

// --- 响应式状态 ---
const isLoading = ref(true);
const isEditing = ref(false);

// [核心修复] 将本地 ref 更改为 computed 属性。
// 这确保了 `note` 始终是对 store 中最新数据的响应式引用。
// 当 store 的 `_allNotesCache` 在保存后被刷新时，这个 computed 属性会
// 自动重新计算，获取到更新后的笔记对象，从而触发 UI 更新。
const note = computed(() => noteStore.getNoteById(props.noteId));

// --- 计算属性 ---
const formattedTimestamp = computed(() => {
  // 使用 .value 是因为 note 是一个 computed ref
  if (!note.value?.timestamp) return '';
  return dayjs(note.value.timestamp).format('MMM D, YYYY HH:mm');
});
const renderedContent = computed(() => {
  if (!note.value?.content) return '';
  return renderMarkdown(note.value.content);
});

// --- 核心方法 ---

const loadNote = async () => {
  if (noteStore._allNotesCache.length === 0) {
    isLoading.value = true;
    await noteStore.fetchNotes();
  }

  // [代码简化] 不再需要手动赋值给本地 ref。
  // computed 属性会自动从 store 获取数据。

  // 检查 note (现在是 computed) 是否有效
  if (note.value) {
    solverStore.analyzeContext(note.value.id);
    noteStore.selectNote(note.value.id);
    if (route.query.edit === 'true') {
      isEditing.value = true;
      router.replace({ query: {} });
    }
  } else {
    noteStore.deselectNote();
  }
  isLoading.value = false;
};

const enterEditMode = () => {
  isEditing.value = true;
};

const handleCancelEdit = () => {
  isEditing.value = false;
};

const handleUpdateAndExit = async (payload) => {
  if (!note.value) return;

  await noteStore.saveNote({
    id: note.value.id,
    content: payload.content,
    tags: payload.tags
  });

  // 保存后，store 会刷新数据，computed 属性会自动更新，
  // 我们只需切换回预览模式，UI 就会显示最新的内容。
  isEditing.value = false;
};

const handleDelete = async () => {
  if (!note.value) return;
  // [修改点] 确认信息改为英文
  if (!confirm(`Are you sure you want to delete note "${note.value.title || note.value.id}"?`)) return;

  const allNotes = noteStore._allNotesCache;
  const currentIndex = allNotes.findIndex(n => n.id === note.value.id);
  await noteStore.deleteNote(note.value.id);

  const newNotes = noteStore._allNotesCache;
  if (newNotes.length === 0) {
    router.push('/');
  } else {
    const nextIndex = Math.min(currentIndex, newNotes.length - 1);
    const nextNoteId = newNotes[nextIndex].id;
    router.push({ name: 'note-view', params: { noteId: nextNoteId } });
  }
};

// --- 侦听器 ---

watch(() => props.noteId, (newId, oldId) => {
  if (newId !== oldId) {
    isEditing.value = false;
    loadNote();
  }
}, { immediate: true });

</script>

<style lang="scss" scoped>
.single-note-view {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  padding: 20px 10% 40px;
  background-color: var(--bg-app);
}

.state-container {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: calc(100% - 40px); text-align: center; color: var(--text-tertiary);
  .error-title { font-size: 24px; font-weight: bold; color: var(--text-primary); margin-bottom: 16px; }
  .back-home-link { margin-top: 24px; color: var(--color-brand); text-decoration: underline; font-weight: 500; }
}

.loading-spinner {
  width: 24px; height: 24px; border: 2px solid var(--border-light);
  border-top-color: var(--color-brand); border-radius: 50%;
  animation: spin 0.8s linear infinite; margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.note-content-wrapper {
  max-width: 900px;
  margin: 0 auto;
}

.note-article {
  background-color: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 80px);
}

.note-actions-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 24px; border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.actions-group { display: flex; gap: 8px; }

.action-btn {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-radius: var(--radius-sm); background-color: transparent;
  color: var(--text-secondary); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
  &:hover { background-color: var(--bg-hover); color: var(--text-primary); }
  &.danger:hover { background-color: var(--color-danger-bg); color: var(--color-danger-text); }
  .icon { width: 16px; height: 16px; }
}

.note-body {
  padding: 0;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.preview-mode-content {
  padding: 16px 48px 32px;
  flex-grow: 1;
}

.note-meta-header {
  margin-bottom: 24px;
  .note-title {
    font-size: 28px; font-weight: 700; line-height: 1.3;
    margin-bottom: 12px; color: var(--text-primary);
  }
  .note-meta {
    display: flex; align-items: center; font-size: 13px;
    color: var(--text-secondary);
    .meta-divider { margin: 0 8px; }
  }
}

.tags-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-chip {
  font-size: 12px; background-color: var(--bg-hover);
  padding: 2px 8px; border-radius: 4px; color: var(--text-secondary);
}

:deep(.markdown-body) {
  font-family: var(--font-family); font-size: 16px;
  line-height: 1.7; color: var(--text-primary);
}

:deep(.smart-editor) {
  border: none;
  box-shadow: none;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  flex-grow: 1;
  .editor-header {
    display: none;
  }
  .editor-body {
    padding: 24px 48px;
  }
  .editor-footer {
    padding: 16px 48px;
  }
}
</style>