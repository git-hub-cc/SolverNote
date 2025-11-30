<template>
  <div class="stream-timeline">
    <!-- 顶部输入区域 -->
    <!--
      SmartEditor 编辑器组件，用于创建新笔记或编辑现有笔记。
      - :is-sending: 绑定 store 中的同步状态，用于禁用发送按钮。
      - :is-edit-mode: 绑定 store 中的编辑模式状态，改变编辑器外观和行为。
      - :initial-content & :initial-tags: 将待编辑笔记的内容和标签传入编辑器。
      - @save: 监听保存事件，触发 handleSave 方法。
      - @cancel: 监听取消编辑事件，触发 handleCancelEdit 方法。
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
      【交互设计】添加 @click="handleBackgroundClick" 事件监听器。
      因为 timeline-container 设置了 flex: 1，它会占据编辑器下方的所有剩余空间。
      当用户点击这片空白区域时，我们认为用户的意图是“取消选中任何笔记”，
      这会触发右侧 AI 侧边栏返回全局的“对话”模式。
    -->
    <div
        class="timeline-container"
        ref="timelineContainerRef"
        @click="handleBackgroundClick"
    >

      <!-- 加载中状态：当 store 正在从后端获取笔记时显示 -->
      <div v-if="noteStore.loading" class="state-msg">
        <div class="loading-spinner"></div>
        <span>加载笔记中...</span>
      </div>

      <!-- 空状态 / 搜索无结果 -->
      <div v-else-if="noteStore.notes.length === 0" class="state-msg empty">
        <!-- 如果是搜索导致的空状态 -->
        <div v-if="noteStore.searchQuery">
          <p>🔍 没有找到关于 "<strong>{{ noteStore.searchQuery }}</strong>" 的笔记</p>
          <button class="reset-btn" @click="noteStore.setSearchQuery('')">清空搜索</button>
        </div>
        <!-- 如果是本身没有任何笔记 -->
        <div v-else>
          <p>📭 还没有任何笔记</p>
          <p class="sub">在上方写下你的第一个想法吧！</p>
        </div>
      </div>

      <!-- 笔记列表 -->
      <div v-else class="notes-list">
        <!--
          遍历 store 中的笔记并渲染 NoteCard 组件。
          NoteCard 组件内部的点击事件使用了 @click.stop 修饰符，
          这意味着点击卡片本身不会冒泡到 timeline-container，也就不会触发 handleBackgroundClick，
          从而避免了选中笔记后立即被取消的冲突。
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
// 引入 Vue 的核心功能
import { onMounted, computed, ref, watch, nextTick } from 'vue'

// 引入 Pinia store
import { useNoteStore } from '@/stores/noteStore'
// 【核心修改】引入 solverStore，以便直接调用其 action
import { useSolverStore } from '@/stores/solverStore'

// 引入子组件
import SmartEditor from '@/components/editor/SmartEditor.vue'
import NoteCard from '@/components/timeline/NoteCard.vue'

// 实例化 store
const noteStore = useNoteStore()
const solverStore = useSolverStore() // 【核心修改】实例化 solverStore

// 模板引用 (Refs)，用于直接操作 DOM 元素
const smartEditorRef = ref(null)       // 引用 SmartEditor 组件实例
const timelineContainerRef = ref(null) // 引用笔记列表的滚动容器

// --- 计算属性 (Computed Properties) ---

// 计算编辑器应该显示的初始内容
const editorContent = computed(() => {
  // 如果处在编辑模式，则返回待编辑笔记的内容；否则返回空字符串
  return noteStore.editingNote ? noteStore.editingNote.content : ''
})

// 计算编辑器应该显示的初始标签
const editorTags = computed(() => {
  // 如果处在编辑模式，则返回待编辑笔记的标签数组；否则返回空数组
  return noteStore.editingNote ? (noteStore.editingNote.tags || []) : []
})

// --- 生命周期钩子 (Lifecycle Hooks) ---

// 组件挂载后执行
onMounted(() => {
  // 首次加载时获取所有笔记
  noteStore.fetchNotes()
})

// --- 侦听器 (Watchers) ---

// 侦听来自 store 的滚动请求
watch(() => noteStore.scrollToNoteId, async (newId) => {
  // 当 scrollToNoteId 有新值时
  if (newId) {
    await nextTick(); // 等待 DOM 更新完成
    const container = timelineContainerRef.value;
    if (container) {
      // 在容器内查找对应 data-note-id 属性的元素
      const targetElement = container.querySelector(`[data-note-id="${newId}"]`);
      if (targetElement) {
        // 如果找到，平滑滚动到该元素的位置
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        // 完成后重置 store 中的请求状态，防止重复滚动
        noteStore.scrollToNoteId = null;
      }
    }
  }
});

// --- 事件处理器 (Event Handlers) ---

// 【新增】处理 timeline 背景点击事件
const handleBackgroundClick = () => {
  // 调用 store 的方法来取消当前选中的笔记
  // 这会进而触发 App.vue 中的侦听器，使 AI 侧边栏返回“对话”模式
  noteStore.deselectNote()
}

// 【核心修改】处理笔记选中事件
const handleSelectNote = (id) => {
  // 检查当前点击的笔记是否已经是被选中的状态
  const isReselecting = id === noteStore.selectedNoteId;

  // 如果用户重新点击了已经选中的笔记
  if (isReselecting) {
    // 直接调用 `analyzeContext`。
    // 这会强制 Solver 重新分析上下文，并将侧边栏模式明确设置为 'context'，
    // 从而解决了在聊天模式下，再次点击笔记无法切换回“智能关联”视图的问题。
    solverStore.analyzeContext(id);
  } else {
    // 如果用户点击的是一篇新笔记，则执行正常的选中流程。
    // `noteStore` 的 `selectedNoteId` 会发生变化，
    // 从而触发 `App.vue` 中的 `watch` 侦听器，自动调用 `analyzeContext`。
    noteStore.selectNote(id);
  }
};

// 处理保存笔记的事件（新建或更新）
const handleSave = async (payload) => {
  await noteStore.saveNote(payload)
  // 如果保存成功（没有错误），则清空编辑器
  if (!noteStore.error) {
    smartEditorRef.value?.clearEditor()
  }
}

// 处理开始编辑笔记的事件
const handleEditStart = (note) => {
  noteStore.startEditing(note)
}

// 处理取消编辑的事件
const handleCancelEdit = () => {
  noteStore.cancelEditing()
}

// 处理删除笔记的事件
const handleDelete = async (id) => {
  await noteStore.deleteNote(id)
}
</script>

<style lang="scss" scoped>
/* 整个组件的根容器样式 */
.stream-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
}

/* 顶部输入区域的包裹容器 */
.input-area-wrapper {
  padding: 24px 10%; /* 上下内边距24px，左右10%以居中 */
  flex-shrink: 0; /* 防止该区域在 flex 布局中被压缩 */
  z-index: 10; /* 确保在滚动时可能位于其他元素之上 */
  background-color: var(--bg-app); /* 使用应用背景色变量 */
}

/* 时间轴滚动容器 */
.timeline-container {
  flex: 1; /* 占据所有剩余的垂直空间，这是实现背景点击的关键 */
  overflow-y: auto; /* 内容超出时显示垂直滚动条 */
  padding: 0 10% 40px 10%; /* 左右内边距与输入区对齐，底部留出空间 */
  scroll-behavior: smooth; /* 启用平滑滚动效果 */
  cursor: default; /* 明确鼠标样式为默认，表示这片区域可交互但不是链接 */
}

/* 笔记列表本身 */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0; /* 笔记卡片之间的间距由卡片自身的 margin-bottom 控制 */
}

/* 加载中或空状态的提示信息样式 */
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

/* 加载动画的 spinner */
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