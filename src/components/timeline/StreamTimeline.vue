<template>
  <div class="stream-timeline">
    <!--
      [核心重构] 顶部的 SmartEditor 现在只用于“创建新笔记”。
      所有与编辑模式相关的 props (:is-edit-mode, :initial-content) 都已被移除。
      它是一个纯粹的输入框，用于捕获用户的即时想法。
    -->
    <div class="input-area-wrapper">
      <SmartEditor
          ref="smartEditorRef"
          :is-sending="noteStore.isSyncing"
          @save="handleSaveNewNote"
      />
    </div>

    <!--
      笔记时间轴列表容器。
      点击这片空白区域会取消任何笔记的选中状态，这会联动 AI 侧边栏。
    -->
    <div
        class="timeline-container"
        ref="timelineContainerRef"
        @click="handleBackgroundClick"
    >

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
          <p>📭 No notes yet.</p>
          <p class="sub">Write your first thought above!</p>
        </div>
      </div>

      <!-- 笔记列表 -->
      <div v-else class="notes-list">
        <!--
          NoteCard 的 @edit 事件已被移除，因为它现在通过 vue-router 自行处理导航。
          我们只需要监听 @delete 事件。
        -->
        <NoteCard
            v-for="note in noteStore.notes"
            :key="note.id"
            :note="note"
            :data-note-id="note.id"
            :is-selected="note.id === noteStore.selectedNoteId"
            @delete="handleDelete"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// 引入 Vue 的核心功能
import { onMounted, ref, watch, nextTick } from 'vue';

// 引入 Pinia store
import { useNoteStore } from '@/stores/noteStore';
import { useSolverStore } from '@/stores/solverStore';

// 引入子组件
import SmartEditor from '@/components/editor/SmartEditor.vue';
import NoteCard from '@/components/timeline/NoteCard.vue';

// 实例化 store
const noteStore = useNoteStore();
const solverStore = useSolverStore();

// 模板引用 (Refs)，用于直接操作 DOM 元素
const smartEditorRef = ref(null);       // 引用 SmartEditor 组件实例
const timelineContainerRef = ref(null); // 引用笔记列表的滚动容器

// --- 生命周期钩子 ---

onMounted(() => {
  // 首次加载时获取所有笔记
  noteStore.fetchNotes();
});

// --- 侦听器 ---

// 侦听来自 store 的滚动请求，在导航或操作后平滑滚动到指定笔记
watch(() => noteStore.scrollToNoteId, async (newId) => {
  if (newId) {
    await nextTick(); // 等待 DOM 更新完成
    const container = timelineContainerRef.value;
    if (container) {
      const targetElement = container.querySelector(`[data-note-id="${newId}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        noteStore.scrollToNoteId = null; // 完成后重置请求
      }
    }
  }
});

// --- 事件处理器 ---

/**
 * 处理 timeline 背景点击事件。
 * 取消当前选中的笔记，这会联动 AI 侧边栏返回默认状态。
 */
const handleBackgroundClick = () => {
  noteStore.deselectNote();
  solverStore.switchToChatMode(); // 同时通知 AI 侧边栏切换回聊天模式
};

/**
 * [核心重构] 处理“创建新笔记”的保存事件。
 * @param {object} payload - 从 SmartEditor 发出的包含 content 和 tags 的对象。
 */
const handleSaveNewNote = async (payload) => {
  // 调用 store 的 saveNote action，不传递 id，后端会自动创建
  await noteStore.saveNote(payload);
  // 如果保存成功，则清空编辑器以便创建下一篇
  if (!noteStore.error) {
    smartEditorRef.value?.clearEditor();
  }
};

/**
 * 处理删除笔记的事件。
 * @param {string} id - 要删除的笔记 ID。
 */
const handleDelete = async (id) => {
  // 弹出确认框，增强鲁棒性
  const noteToDelete = noteStore.getNoteById(id);
  // [修改点] 确认信息改为英文
  if (noteToDelete && confirm(`Are you sure you want to delete note "${noteToDelete.title || noteToDelete.id}"?`)) {
    await noteStore.deleteNote(id);
  }
};
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
  flex: 1; /* 占据所有剩余的垂直空间 */
  overflow-y: auto; /* 内容超出时显示垂直滚动条 */
  padding: 0 10% 40px 10%; /* 左右内边距与输入区对齐，底部留出空间 */
  scroll-behavior: smooth; /* 启用平滑滚动效果 */
}

/* 笔记列表本身 */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0;
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