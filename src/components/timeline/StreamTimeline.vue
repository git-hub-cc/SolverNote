<template>
  <div class="stream-timeline">
    <!-- 顶部的 SmartEditor，仅用于“创建新笔记” -->
    <div class="input-area-wrapper">
      <SmartEditor
          ref="smartEditorRef"
          :is-sending="noteStore.isSyncing"
          @save="handleSaveNewNote"
      />
    </div>

    <!--
      [新增] 筛选状态提示栏
      - 仅在有任何筛选条件 (文本搜索或标签筛选) 激活时显示。
      - 清晰地告诉用户当前的筛选状态。
      - 提供一个快捷按钮来清除所有筛选。
    -->
    <div v-if="isFilterActive" class="filter-status-bar">
      <span class="filter-text">
        <template v-if="noteStore.activeTagFilter">
          Filtering by tag: <strong class="filter-keyword">#{{ noteStore.activeTagFilter }}</strong>
        </template>
        <template v-else-if="noteStore.searchQuery">
          Search results for: <strong class="filter-keyword">"{{ noteStore.searchQuery }}"</strong>
        </template>
      </span>
      <button class="clear-filter-btn" @click="noteStore.clearFilters()">
        Clear Filter
      </button>
    </div>

    <!-- 笔记时间轴列表容器 -->
    <div
        class="timeline-container"
        ref="timelineContainerRef"
        @click="handleBackgroundClick"
    >
      <!-- 加载中状态 -->
      <div v-if="noteStore.loading" class="state-msg">
        <div class="loading-spinner"></div>
        <span>正在加载笔记...</span>
      </div>

      <!-- 空状态 / 搜索无结果 -->
      <div v-else-if="noteStore.notes.length === 0" class="state-msg empty">
        <!-- 根据不同的筛选模式，显示不同的提示信息 -->
        <div v-if="noteStore.activeTagFilter">
          <p>🏷️ No notes found with the tag "<strong>#{{ noteStore.activeTagFilter }}</strong>"</p>
          <button class="reset-btn" @click="noteStore.clearFilters()">Clear filter</button>
        </div>
        <div v-else-if="noteStore.searchQuery">
          <p>🔍 No notes found for "<strong>{{ noteStore.searchQuery }}</strong>"</p>
          <button class="reset-btn" @click="noteStore.clearFilters()">Clear search</button>
        </div>
        <div v-else>
          <p>📭 No notes yet.</p>
          <p class="sub">Start by typing your first thought above!</p>
        </div>
      </div>

      <!-- 笔记列表 -->
      <div v-else class="notes-list">
        <NoteCard
            v-for="note in noteStore.notes"
            :key="note.id"
            :note="note"
            :data-note-id="note.id"
            :is-selected="note.id === noteStore.selectedNoteId"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch, nextTick, computed } from 'vue'; // 新增 computed
import { useNoteStore } from '@/stores/noteStore';
import { useSolverStore } from '@/stores/solverStore';
import SmartEditor from '@/components/editor/SmartEditor.vue';
import NoteCard from '@/components/timeline/NoteCard.vue';

// 实例化 store
const noteStore = useNoteStore();
const solverStore = useSolverStore();

// 模板引用 (Refs)
const smartEditorRef = ref(null);
const timelineContainerRef = ref(null);

// --- [新增] 计算属性 ---
const isFilterActive = computed(() => {
  // 只要文本搜索或标签筛选中任意一个有值，就认为筛选是激活的。
  return !!noteStore.searchQuery || !!noteStore.activeTagFilter;
});


// --- 生命周期钩子 ---
onMounted(() => {
  noteStore.fetchNotes();
});

// --- 侦听器 ---
watch(() => noteStore.scrollToNoteId, async (newId) => {
  if (newId) {
    await nextTick();
    const container = timelineContainerRef.value;
    if (container) {
      const targetElement = container.querySelector(`[data-note-id="${newId}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        noteStore.scrollToNoteId = null;
      }
    }
  }
});

// --- 事件处理器 ---
const handleBackgroundClick = () => {
  noteStore.deselectNote();
  solverStore.switchToChatMode();
};

const handleSaveNewNote = async (payload) => {
  await noteStore.saveNote(payload);
  if (!noteStore.error) {
    smartEditorRef.value?.clearEditor();
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
  z-index: 9; /* 确保在滚动时可能位于其他元素之上 */
  background-color: var(--bg-app); /* 使用应用背景色变量 */
}

/* [新增] 筛选状态栏样式 */
.filter-status-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin: 0 10% 16px 10%;
  background-color: var(--color-brand-light);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  animation: slideIn 0.3s ease-out;

  .filter-keyword {
    color: var(--color-brand);
    font-weight: 600;
  }
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.clear-filter-btn {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-secondary);
  }
}

/* 时间轴滚动容器 */
.timeline-container {
  flex: 1; /* 占据所有剩余的垂直空间 */
  overflow-y: auto; /* 内容超出时显示垂直滚动条 */
  // [修改] 顶部 padding 设为 0，因为状态栏现在提供了间距
  padding: 0 10% 40px 10%;
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