<template>
  <div class="single-note-view">
    <!-- 状态一: 正在加载笔记 -->
    <div v-if="isLoading" class="state-container">
      <div class="loading-spinner"></div>
      <span>正在加载笔记...</span>
    </div>

    <!-- 状态二: 笔记未找到 -->
    <div v-else-if="!note" class="state-container empty">
      <p class="error-title">:( 笔记不存在</p>
      <p>无法找到 ID 为 "{{ noteId }}" 的笔记。</p>
      <p>它可能已被删除或移动。</p>
      <router-link to="/" class="back-home-link">返回主页</router-link>
    </div>

    <!-- 状态三: 笔记内容展示 (核心视图) -->
    <div v-else class="note-content-wrapper">
      <article class="note-article">
        <!-- 笔记操作头部 -->
        <header class="note-actions-header">
          <!-- 占位符，保持按钮在右侧 -->
          <div class="header-placeholder"></div>

          <!-- 右侧操作按钮组 -->
          <div class="actions-group">
            <button class="action-btn" @click="toggleEdit" :title="isEditing ? '预览笔记' : '编辑笔记'">
              <!-- 根据编辑状态动态切换图标 -->
              <EyeIcon v-if="isEditing" class="icon" />
              <Edit3Icon v-else class="icon" />
              <span>{{ isEditing ? '预览' : '编辑' }}</span>
            </button>
            <button class="action-btn danger" @click="handleDelete" title="删除笔记">
              <Trash2Icon class="icon" />
              <span>删除</span>
            </button>
          </div>
        </header>

        <!-- 笔记元信息 -->
        <div class="note-meta-header">
          <h1 class="note-title">{{ note.title || '无标题笔记' }}</h1>
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

        <!-- 内容区域: 编辑模式或预览模式 -->
        <div class="note-body">
          <!-- 编辑模式: 显示 Textarea -->
          <textarea
              v-if="isEditing"
              ref="editorTextarea"
              v-model="localContent"
              class="editor-textarea markdown-body-font"
              placeholder="开始书写..."
          ></textarea>
          <!-- 预览模式: 显示渲染后的 HTML -->
          <div v-else class="markdown-body" v-html="renderedContent"></div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useNoteStore } from '@/stores/noteStore';
import { useSolverStore } from '@/stores/solverStore';
import { renderMarkdown } from '@/utils/markdownRenderer';
import dayjs from 'dayjs';
import { Edit3 as Edit3Icon, Trash2 as Trash2Icon, Eye as EyeIcon } from 'lucide-vue-next';

// --- Props 定义 ---
// 通过路由的 `props: true` 配置，自动接收 URL 中的 noteId 参数
const props = defineProps({
  noteId: {
    type: String,
    required: true
  }
});

// --- 实例化 Store 和 Router ---
const noteStore = useNoteStore();
const solverStore = useSolverStore();
const router = useRouter();

// --- 响应式状态 ---
const note = ref(null);                 // 存储当前视图展示的完整笔记对象
const isLoading = ref(true);            // 控制加载状态
const isEditing = ref(false);           // 控制是否处于编辑模式
const localContent = ref('');           // 编辑模式下与 textarea 双向绑定的内容
const editorTextarea = ref(null);       // 对 textarea DOM 元素的引用
let debounceTimer = null;               // 用于自动保存的防抖计时器

// --- 计算属性 ---

// 格式化笔记的时间戳，提供更友好的显示
const formattedTimestamp = computed(() => {
  if (!note.value?.timestamp) return '';
  return dayjs(note.value.timestamp).format('YYYY年MM月DD日 HH:mm');
});

// 渲染 Markdown 内容为 HTML，用于预览
const renderedContent = computed(() => {
  // 预览时使用 store 中的权威数据，而不是 localContent
  if (!note.value?.content) return '';
  return renderMarkdown(note.value.content);
});

// --- 核心方法 ---

/**
 * [核心] 加载笔记数据并触发 AI 分析
 * 负责根据 noteId 从 store 获取数据，并更新组件状态
 */
const loadNoteAndAnalyze = async () => {
  // 1. 如果 store 缓存为空 (例如用户直接通过 URL 访问)，先从后端拉取所有笔记
  if (noteStore._allNotesCache.length === 0) {
    isLoading.value = true;
    await noteStore.fetchNotes();
  }

  // 2. 从 store 的完整缓存中查找当前笔记
  const foundNote = noteStore.getNoteById(props.noteId);
  note.value = foundNote;

  // 3. AI 联动与状态同步
  if (foundNote) {
    // 将编辑区内容与找到的笔记内容同步
    localContent.value = foundNote.content;
    // [关键联动] 通知 solverStore 进行上下文分析
    solverStore.analyzeContext(foundNote.id);
    // 将当前笔记设为全局的“选中”项，保持应用状态一致
    noteStore.selectNote(foundNote.id);
  } else {
    // 如果没找到笔记，确保清除全局选中状态
    noteStore.deselectNote();
  }

  // 4. 更新加载状态
  isLoading.value = false;
};

/**
 * 切换编辑/预览模式
 */
const toggleEdit = async () => {
  isEditing.value = !isEditing.value;
  // 如果从预览切换到编辑，自动聚焦到输入框
  if (isEditing.value) {
    await nextTick(); // 等待 DOM 更新
    editorTextarea.value?.focus();
  }
};

/**
 * 处理删除笔记的逻辑
 */
const handleDelete = async () => {
  if (!note.value) return;
  if (!confirm(`确定要删除笔记 "${note.value.title || note.value.id}" 吗？`)) return;

  // 1. 在删除前，先获取当前笔记在完整列表中的位置
  const allNotes = noteStore._allNotesCache;
  const currentIndex = allNotes.findIndex(n => n.id === note.value.id);

  // 2. 调用 store 执行删除操作
  await noteStore.deleteNote(note.value.id);

  // 3. 决定删除后跳转到哪个笔记
  const newNotes = noteStore._allNotesCache; // 获取删除后的新列表
  if (newNotes.length === 0) {
    // 如果没有笔记了，跳转到主页
    router.push('/');
  } else {
    // 默认跳转到被删除笔记原位置的那个笔记
    // 如果被删除的是最后一个，则跳转到新的最后一个
    const nextIndex = Math.min(currentIndex, newNotes.length - 1);
    const nextNoteId = newNotes[nextIndex].id;
    router.push({ name: 'note-view', params: { noteId: nextNoteId } });
  }
};

// --- 侦听器 (Watchers) ---

// 使用 watchEffect 可以在其依赖项 (props.noteId) 变化时自动重新执行。
// 这确保了当用户在左侧文件树点击不同笔记时，本视图能正确地刷新内容。
watchEffect(() => {
  // 切换笔记时，默认回到预览模式
  isEditing.value = false;
  loadNoteAndAnalyze();
});

// 侦听 localContent 的变化，实现自动保存功能
watch(localContent, (newContent) => {
  // 必须在编辑模式下且笔记已加载时才触发
  if (isEditing.value && note.value) {
    // 清除上一个计时器，实现防抖
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      // 避免与 store 中的内容相同时还发送保存请求
      if (newContent !== note.value.content) {
        noteStore.saveNote({
          id: note.value.id,
          content: newContent,
          tags: note.value.tags || []
        });
      }
    }, 800); // 延迟800毫秒后执行保存
  }
});
</script>

<style lang="scss" scoped>
.single-note-view {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  padding: 20px 15% 40px; // 调整上下边距
  background-color: var(--bg-app);
}

// 加载中和空状态的通用容器样式
.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100% - 40px);
  text-align: center;
  color: var(--text-tertiary);

  .error-title {
    font-size: 24px;
    font-weight: bold;
    color: var(--text-primary);
    margin-bottom: 16px;
  }

  .back-home-link {
    margin-top: 24px;
    color: var(--color-brand);
    text-decoration: underline;
    font-weight: 500;
  }
}

// 加载动画
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-light);
  border-top-color: var(--color-brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

// 笔记内容包裹器
.note-content-wrapper {
  max-width: 800px;
  margin: 0 auto;
}

.note-article {
  background-color: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
}

// 顶部操作栏
.note-actions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-light);
}

.actions-group {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  background-color: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &.danger:hover {
    background-color: var(--color-danger-bg);
    color: var(--color-danger-text);
  }

  .icon {
    width: 16px;
    height: 16px;
  }
}

// 笔记元信息区域
.note-meta-header {
  padding: 24px 48px 16px;

  .note-title {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  .note-meta {
    display: flex;
    align-items: center;
    font-size: 13px;
    color: var(--text-secondary);
    .meta-divider { margin: 0 8px; }
  }
}

.tags-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-chip {
  font-size: 12px;
  background-color: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--text-secondary);
}

// 笔记正文区域
.note-body {
  padding: 16px 48px 32px;
  flex-grow: 1;
}

// 共享字体样式，确保编辑和预览视觉一致
.markdown-body-font {
  font-family: var(--font-family);
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-primary);
}

// 编辑器样式
.editor-textarea {
  @extend .markdown-body-font;
  width: 100%;
  min-height: 400px; /* 保证足够的初始编辑高度 */
  border: none;
  outline: none;
  resize: vertical;
  background-color: transparent;

  &::placeholder {
    color: var(--text-tertiary);
  }
}

// 预览区域的微调
:deep(.markdown-body) {
  @extend .markdown-body-font;
}
</style>