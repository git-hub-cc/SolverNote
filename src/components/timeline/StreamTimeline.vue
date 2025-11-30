<template>
  <div class="stream-timeline">
    <!-- 顶部输入区域 -->
    <!--
      注意：这里也可以加 @click.stop，防止点击编辑器周围区域时触发取消选中。
      但在当前布局中，input-area-wrapper 和 timeline-container 是兄弟节点，
      且 SmartEditor 内部通常会捕获焦点，所以一般不需要额外处理。
    -->
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

    <!--
      笔记时间轴列表容器
      [修改点]: 添加 @click="handleBackgroundClick"
      因为 timeline-container 设置了 flex: 1，它会占据剩余的所有屏幕空间。
      当笔记很少时，下方大片空白区域都属于这个 div。
      点击这里意味着用户想“取消聚焦”，回到全局聊天模式。
    -->
    <div
        class="timeline-container"
        ref="timelineContainerRef"
        @click="handleBackgroundClick"
    >

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
        <!--
          NoteCard 组件内部现在使用了 @click.stop
          所以点击卡片本身不会冒泡到 timeline-container，不会触发 handleBackgroundClick
        -->
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
import { onMounted, computed, ref, watch, nextTick } from 'vue'
import { useNoteStore } from '@/stores/noteStore'
import SmartEditor from '@/components/editor/SmartEditor.vue'
import NoteCard from '@/components/timeline/NoteCard.vue'

const noteStore = useNoteStore()
const smartEditorRef = ref(null)
const timelineContainerRef = ref(null)

const editorContent = computed(() => {
  return noteStore.editingNote ? noteStore.editingNote.content : ''
})
const editorTags = computed(() => {
  return noteStore.editingNote ? (noteStore.editingNote.tags || []) : []
})

onMounted(() => {
  noteStore.fetchNotes()
})

// 监听滚动请求 (保持原有的修复逻辑)
watch(() => noteStore.scrollToNoteId, async (newId) => {
  if (newId) {
    await nextTick();
    const container = timelineContainerRef.value;
    if (container) {
      const targetElement = container.querySelector(`[data-note-id="${newId}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        noteStore.scrollToNoteId = null;
      }
    }
  }
});

// --- 事件处理 ---

// [新增] 背景点击处理
const handleBackgroundClick = () => {
  // 调用 store 的 deselectNote 方法，将 selectedNoteId 置为 null
  // 这会触发右侧 Sidebar 切换回 "Chat" 模式
  noteStore.deselectNote()
}

const handleSelectNote = (id) => {
  // 这里直接调用 selectNote，store 中现在的逻辑是强制选中，不再 toggle
  noteStore.selectNote(id)
}

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
</script>

<style lang="scss" scoped>
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
  flex: 1; /* 占据剩余空间，确保空白区域可点击 */
  overflow-y: auto;
  padding: 0 10% 40px 10%;
  scroll-behavior: smooth;
  cursor: default; /* 明确鼠标样式 */
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  /*
     给列表增加一点最小高度，或者由 timeline-container 的 flex: 1 保证高度。
     这里不需要额外设置，因为点击 list 内部的空隙也会冒泡到 container。
  */
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