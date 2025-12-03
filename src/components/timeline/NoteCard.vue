<template>
  <article
      class="note-card"
      :class="{ 'is-selected': isSelected }"
      @click="navigateToNote"
  >
    <!-- Meta Info: 时间和标签 -->
    <div class="note-header">
      <div class="meta-left">
        <span class="note-time">{{ formattedTime }}</span>
        <span v-if="note.tags && note.tags.length" class="tag-spacer">·</span>
        <div class="mini-tags" v-if="note.tags">
          <span v-for="tag in note.tags" :key="tag" class="mini-tag">#{{ tag }}</span>
        </div>
      </div>

      <div class="actions-group" @click.stop>
        <button class="action-btn" @click="handleEdit" title="Edit this note">
          <Edit2Icon class="icon-xs" />
        </button>
        <button class="action-btn danger" @click="handleRequestDelete" title="Delete">
          <Trash2Icon class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- Content Body: 渲染后的 Markdown 内容 -->
    <!--
      [核心修改] markdown-body 类现在包含了 max-height 样式，
      用于限制过长内容的显示高度。
    -->
    <div class="markdown-body" v-html="renderedContent"></div>

  </article>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useNoteStore } from '@/stores/noteStore';
import dayjs from 'dayjs';
import { Edit2 as Edit2Icon, Trash2 as Trash2Icon } from 'lucide-vue-next';
import { renderMarkdown } from '@/utils/markdownRenderer';

const props = defineProps({
  note: {
    type: Object,
    required: true
  },
  isSelected: Boolean
});

const router = useRouter();
const noteStore = useNoteStore();

const formattedTime = computed(() => {
  return dayjs(props.note.timestamp).format('MMM D, HH:mm');
});

const renderedContent = computed(() => {
  return renderMarkdown(props.note.content || '');
});

const navigateToNote = () => {
  router.push({
    name: 'note-view',
    params: { noteId: props.note.id }
  });
};

const handleEdit = () => {
  router.push({
    name: 'note-view',
    params: { noteId: props.note.id },
    query: { edit: 'true' }
  });
};

const handleRequestDelete = () => {
  noteStore.requestDeleteNote(props.note.id);
};

</script>

<style lang="scss" scoped>
.note-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  /*
    [核心修改] 移除了 margin-bottom
    现在项与项之间的间距由父组件 (StreamTimeline.vue) 的布局控制，
    或者可以在 .virtual-item-wrapper 上设置 padding-bottom。
    这里移除是为了让虚拟滚动的尺寸计算更精确。
  */
  transition: all 0.2s;
  cursor: pointer;
  /* 添加一个底部内边距，以保证在有滚动条时内容不会紧贴边缘 */
  padding-bottom: 20px;

  &:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow-card);
    .actions-group {
      opacity: 1;
    }
  }

  &.is-selected {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 1px var(--color-brand-light);
  }
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  height: 20px;
}

.meta-left {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

.tag-spacer { margin: 0 6px; }
.mini-tag { color: var(--text-secondary); margin-right: 6px; }

.actions-group {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.action-btn {
  padding: 4px;
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;
  &:hover { background: var(--bg-hover); color: var(--text-primary); }
  &.danger:hover { background: var(--color-danger-bg); color: var(--color-danger-text); }
}

.icon-xs { width: 14px; height: 14px; }

/*
  [核心修改] markdown-body 样式
  - 增加了 max-height 来限制最大高度。
  - overflow-y: auto 在内容超出时显示滚动条。
  - position: relative 用于支持内部的遮罩效果。
  - mask-image 创建了一个渐变遮罩，在内容底部产生淡出效果，
    视觉上提示用户此处内容可滚动。
*/
:deep(.markdown-body) {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  /* 限制最大高度为视口高度的40%，或根据需要调整为固定值如 400px */
  max-height: 40vh;
  overflow-y: auto;
  position: relative;
  padding-right: 8px; /* 为滚动条留出空间，避免内容遮挡 */

  /* 渐变遮罩，提升UI美感 */
  -webkit-mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 95%, transparent 100%);

  /* 自定义滚动条样式，使其更纤细 */
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.4);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }

  p { margin-bottom: 0.75em; }
  p:last-child { margin-bottom: 0; }
  ul, ol { padding-left: 1.5em; margin-bottom: 0.75em; }
  code { background: var(--color-code-bg); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.9em; }
  .wiki-link { color: var(--color-brand); font-weight: 500; cursor: pointer; background: var(--color-brand-light); padding: 0 4px; border-radius: 4px; }
}
</style>