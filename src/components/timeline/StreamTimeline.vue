<template>
  <div class="stream-timeline">
    <!-- 顶部输入区域 -->
    <div class="input-area-wrapper">
      <!--
        SmartEditor 组件绑定：
        - initial-tags: 将当前编辑笔记的 tags 传递给编辑器
        - save: 接收 { content, tags } 对象
      -->
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
    <div class="timeline-container">

      <!-- 加载中状态 -->
      <div v-if="noteStore.loading" class="state-msg">
        <div class="loading-spinner"></div>
        <span>Loading notes...</span>
      </div>

      <!-- 空状态 / 搜索无结果 -->
      <div v-else-if="noteStore.notes.length === 0" class="state-msg empty">
        <div v-if="noteStore.searchQuery">
          <p>🔍 No notes found for "<strong>{{ noteStore.searchQuery }}</strong>"</p>
          <button class="reset-btn" @click="noteStore.setSearchQuery('')">Clear Search</button>
        </div>
        <div v-else>
          <p>📭 No notes yet</p>
          <p class="sub">Write your first thought above!</p>
        </div>
      </div>

      <!-- 笔记列表 -->
      <div v-else class="notes-list">
        <NoteCard
            v-for="note in noteStore.notes"
            :key="note.id"
            :note="note"
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
import { onMounted, computed, ref } from 'vue'
import { useNoteStore } from '@/stores/noteStore'
import SmartEditor from '@/components/editor/SmartEditor.vue'
import NoteCard from '@/components/timeline/NoteCard.vue'

const noteStore = useNoteStore()
// 引用编辑器组件实例，用于调用 clearEditor
const smartEditorRef = ref(null)

// 计算属性：动态获取传递给编辑器的内容
const editorContent = computed(() => {
  return noteStore.editingNote ? noteStore.editingNote.content : ''
})

// [新增] 计算属性：动态获取传递给编辑器的标签
const editorTags = computed(() => {
  return noteStore.editingNote ? (noteStore.editingNote.tags || []) : []
})

// 组件挂载时拉取数据
onMounted(() => {
  noteStore.fetchNotes()
})

// --- 事件处理 ---

// 保存 (新建或更新)
// payload: { content: string, tags: string[] }
const handleSave = async (payload) => {
  await noteStore.saveNote(payload)

  // 保存操作完成后，如果没有错误，手动清空编辑器
  // 注意：更新模式下，store 会重置 editingNote 导致组件 props 变化自动清空
  // 但新建模式下，需要这里手动触发清空
  if (!noteStore.error) {
    smartEditorRef.value?.clearEditor()
  }
}

// 开始编辑 (来自 NoteCard 的 edit 事件)
const handleEditStart = (note) => {
  noteStore.startEditing(note)
}

// 取消编辑 (来自 SmartEditor 的 cancel 事件)
const handleCancelEdit = () => {
  noteStore.cancelEditing()
}

// 删除 (来自 NoteCard 的 delete 事件)
const handleDelete = async (id) => {
  await noteStore.deleteNote(id)
}

// 选中 (来自 NoteCard 的 select 事件，用于 AI 分析)
const handleSelectNote = (id) => {
  noteStore.selectNote(id)
}
</script>

<style lang="scss" scoped>
/*
  布局结构：
  stream-timeline (Flex Column, 100% Height)
  ├── input-area-wrapper (Fixed Height, z-index top)
  └── timeline-container (Flex 1, Scrollable)
*/

.stream-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden; /* 防止最外层出现滚动条 */
  position: relative;
}

.input-area-wrapper {
  /* 增加内边距让编辑器居中且有呼吸感 */
  padding: 24px 10%;
  flex-shrink: 0;
  z-index: 10;
  background-color: var(--bg-app); /* 遮挡下方滚动的列表 */
}

.timeline-container {
  flex: 1;
  overflow-y: auto; /* 仅此处垂直滚动 */
  padding: 0 10% 40px 10%; /* 底部留白，防止最后一张卡片贴底 */
  scroll-behavior: smooth;

  /* 隐藏默认滚动条但保留功能 (Chrome/Safari) */
  &::-webkit-scrollbar {
    width: 6px;
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
  }

  /* 鼠标悬停时才显示滚动条 */
  &:hover::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
  }

  /* Firefox */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  &:hover {
    scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
  }
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0; /* NoteCard 自身有 margin-bottom */
}

/* 状态提示信息 (Loading / Empty) */
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

/* 简单的加载动画 */
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