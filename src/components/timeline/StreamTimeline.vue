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

    <!-- 筛选状态提示栏 -->
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

    <!--
      笔记时间轴列表容器
      - ref="scrollContainerRef" 用于让虚拟滚动器识别滚动区域。
    -->
    <div
        class="timeline-container"
        ref="scrollContainerRef"
        @click="handleBackgroundClick"
    >
      <!-- 加载中状态 -->
      <div v-if="noteStore.loading" class="state-msg">
        <div class="loading-spinner"></div>
        <span>正在加载笔记...</span>
      </div>

      <!-- 空状态 / 搜索无结果 -->
      <div v-else-if="notes.length === 0" class="state-msg empty">
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

      <!--
        虚拟滚动列表实现
        - v-if="notes.length > 0" 确保只有在有数据时才渲染这个复杂的结构。
      -->
      <div
          v-if="notes.length > 0"
          class="virtual-scroll-scaffolding"
          :style="{ height: `${totalSize}px` }"
      >
        <div
            class="virtual-scroll-list"
            :style="{ transform: `translateY(${virtualItems[0]?.start ?? 0}px)` }"
        >
          <!--
            [鲁棒性修复] 我们为每个 virtualItem 的 key 添加了笔记的 id，
            这有助于 Vue 在列表内容发生变化（如筛选）时更高效地复用和更新 DOM。
          -->
          <div
              v-for="virtualItem in virtualItems"
              :key="notes[virtualItem.index].id"
              :ref="virtualItem.measureElement"
              class="virtual-item-wrapper"
          >
            <NoteCard
                :note="notes[virtualItem.index]"
                :is-selected="notes[virtualItem.index].id === noteStore.selectedNoteId"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch, computed, reactive } from 'vue';
import { useNoteStore } from '@/stores/noteStore';
import { useSolverStore } from '@/stores/solverStore';
import SmartEditor from '@/components/editor/SmartEditor.vue';
import NoteCard from '@/components/timeline/NoteCard.vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

// --- 实例化 Store ---
const noteStore = useNoteStore();
const solverStore = useSolverStore();

// --- 模板引用 (Refs) ---
const smartEditorRef = ref(null);
const scrollContainerRef = ref(null); // 指向滚动容器

// --- 计算属性 ---
const isFilterActive = computed(() => !!noteStore.searchQuery || !!noteStore.activeTagFilter);
const notes = computed(() => noteStore.notes);

// --- [核心修复] 虚拟滚动器响应式配置 ---

// 1. 创建一个响应式对象来存储虚拟器的配置。
//    初始状态下，count 为 0，getScrollElement 返回 null。
const options = reactive({
  count: notes.value.length,
  getScrollElement: () => null,
  estimateSize: () => 250, // 预估平均高度
  overscan: 5,
});

// 2. 侦听 `scrollContainerRef` 的变化。
//    这是解决问题的关键：确保在 DOM 元素挂载后才为虚拟器提供滚动容器。
watch(scrollContainerRef, (element) => {
  if (element) {
    // 一旦 DOM 元素可用，立即更新配置中的 getScrollElement 函数。
    options.getScrollElement = () => element;
  }
});

// 3. 侦听 `notes` 数组长度的变化。
//    当笔记数据加载或筛选后，更新虚拟器的 `count`。
watch(() => notes.value.length, (newCount) => {
  options.count = newCount;
});

// 4. 将响应式配置对象传递给 `useVirtualizer`。
//    现在虚拟器会对 `options` 内部的任何变化做出反应。
const virtualizer = useVirtualizer(options);

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

// --- 生命周期钩子 ---
onMounted(() => {
  noteStore.fetchNotes();
});

// --- 侦听器 ---
watch(() => noteStore.scrollToNoteId, (newId) => {
  if (newId && notes.value.length > 0) {
    const index = notes.value.findIndex(note => note.id === newId);
    if (index !== -1) {
      console.log(`[VirtualScroll] Scrolling to index: ${index}`);
      virtualizer.value.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
    }
    noteStore.scrollToNoteId = null;
  }
});

// --- 事件处理器 ---
const handleBackgroundClick = (event) => {
  // 确保点击的是容器背景，而不是卡片本身
  if (event.target === scrollContainerRef.value) {
    noteStore.deselectNote();
    solverStore.switchToChatMode();
  }
};

const handleSaveNewNote = async (payload) => {
  await noteStore.saveNote(payload);
  if (!noteStore.error) {
    smartEditorRef.value?.clearEditor();
    scrollContainerRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
  }
};
</script>

<style lang="scss" scoped>
/* 样式无需修改，保持原样 */
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
  z-index: 9;
  background-color: var(--bg-app);
}

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

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 10% 40px 10%;
  position: relative;
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

.virtual-scroll-scaffolding {
  width: 100%;
  position: relative;
}

.virtual-scroll-list {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.virtual-item-wrapper {
  width: 100%;
  /* 为每个虚拟项添加底部间距，形成卡片间隔 */
  padding-bottom: 16px;
}
</style>