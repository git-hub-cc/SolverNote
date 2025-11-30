<template>
  <div class="stream-timeline">
    <!-- 顶部输入区域 -->
    <div class="input-area-wrapper">
      <SmartEditor
          ref="smartEditorRef"
          :is-sending="noteStore.isSyncing"
          :is-edit-mode="noteStore.isEditMode"
          :initial-content="editorContent"
          :initial-tags="editorTags"
          @save="handleSave"
          @cancel="handleCancelEdit"
      />
    </div>

    <!-- 笔记时间轴列表容器 -->
    <div class="timeline-container" ref="timelineContainerRef">

      <!-- 加载中状态 -->
      <div v-if="noteStore.loading" class="state-msg">
        <div class="loading-spinner"></div>
        <span>加载笔记中...</span>
      </div>

      <!-- 空状态 / 搜索无结果 -->
      <div v-else-if="noteStore.notes.length === 0" class="state-msg empty">
        <div v-if="noteStore.searchQuery">
          <p>🔍 没有找到关于 "<strong>{{ noteStore.searchQuery }}</strong>" 的笔记</p>
          <button class="reset-btn" @click="noteStore.setSearchQuery('')">清空搜索</button>
        </div>
        <div v-else>
          <p>📭 还没有任何笔记</p>
          <p class="sub">在上方写下你的第一个想法吧！</p>
        </div>
      </div>

      <!-- 笔记列表 -->
      <div v-else class="notes-list">
        <!-- 关键修改: 增加 data-note-id 属性，用于 DOM 查询 -->
        <NoteCard
            v-for="note in noteStore.notes"
            :key="note.id"
            :note="note"
            :data-note-id="note.id"
            :is-selected="note.id === noteStore.selectedNoteId"
            @select="handleSelectNote"
            @edit="handleEditStart"
            @delete="handleDelete"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed, ref, watch, nextTick } from 'vue' // 引入 watch 和 nextTick
import { useNoteStore } from '@/stores/noteStore'
import SmartEditor from '@/components/editor/SmartEditor.vue'
import NoteCard from '@/components/timeline/NoteCard.vue'

const noteStore = useNoteStore()
const smartEditorRef = ref(null)
const timelineContainerRef = ref(null) // [新增] 引用 timeline 容器

const editorContent = computed(() => {
  return noteStore.editingNote ? noteStore.editingNote.content : ''
})
const editorTags = computed(() => {
  return noteStore.editingNote ? (noteStore.editingNote.tags || []) : []
})

onMounted(() => {
  noteStore.fetchNotes()
})

// --- [新增] 监听滚动请求 ---
watch(() => noteStore.scrollToNoteId, async (newId) => {
  if (newId) {
    // 等待 DOM 更新完成
    await nextTick();

    const container = timelineContainerRef.value;
    if (container) {
      // 通过 data-note-id 属性查找对应的笔记卡片元素
      const targetElement = container.querySelector(`[data-note-id="${newId}"]`);

      if (targetElement) {
        // 使用 scrollIntoView 实现平滑滚动
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center' // 将目标元素滚动到视口的中间
        });

        // 处理完后重置状态，以便下次还能触发
        noteStore.scrollToNoteId = null;
      }
    }
  }
});


// --- 事件处理 ---
const handleSave = async (payload) => {
  await noteStore.saveNote(payload)
  if (!noteStore.error) {
    smartEditorRef.value?.clearEditor()
  }
}
const handleEditStart = (note) => {
  noteStore.startEditing(note)
}
const handleCancelEdit = () => {
  noteStore.cancelEditing()
}
const handleDelete = async (id) => {
  await noteStore.deleteNote(id)
}
const handleSelectNote = (id) => {
  noteStore.selectNote(id)
}
</script>

<style lang="scss" scoped>
/* 样式保持不变 */
.stream-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
}

.input-area-wrapper {
  padding: 24px 10%;
  flex-shrink: 0;
  z-index: 10;
  background-color: var(--bg-app);
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 10% 40px 10%;
  scroll-behavior: smooth;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.state-msg {
  text-align: center;
  color: var(--text-tertiary);
  margin-top: 60px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  &.empty .sub {
    font-size: 13px;
    opacity: 0.8;
    margin-top: 4px;
  }

  .reset-btn {
    margin-top: 12px;
    color: var(--color-brand);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
    &:hover { color: #4F46E5; }
  }
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-light);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>