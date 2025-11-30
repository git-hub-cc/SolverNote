<template>
  <article
      class="note-card"
      :class="{ 'is-selected': isSelected }"
      @click="$emit('select', note.id)"
  >
    <!-- Meta Info -->
    <div class="note-header">
      <div class="meta-left">
        <span class="note-time">{{ formattedTime }}</span>
        <span v-if="note.tags && note.tags.length" class="tag-spacer">·</span>
        <div class="mini-tags" v-if="note.tags">
          <span v-for="tag in note.tags" :key="tag" class="mini-tag">#{{ tag }}</span>
        </div>
      </div>

      <!-- [新增] 操作按钮 -->
      <div class="actions-group" @click.stop>
        <button class="action-btn" @click="$emit('edit', note)" title="Edit">
          <Edit2Icon class="icon-xs" />
        </button>
        <button class="action-btn danger" @click="$emit('delete', note.id)" title="Delete">
          <Trash2Icon class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- Content Body -->
    <!-- 使用新的 renderMarkdown (markdown-it) -->
    <div class="markdown-body" v-html="renderedContent"></div>

  </article>
</template>

<script setup>
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Edit2 as Edit2Icon, Trash2 as Trash2Icon } from 'lucide-vue-next'
// [修改] 引用新的渲染器
import { renderMarkdown } from '@/utils/markdownRenderer'

const props = defineProps({
  note: {
    type: Object,
    required: true
  },
  isSelected: Boolean
})

defineEmits(['select', 'edit', 'delete'])

const formattedTime = computed(() => {
  return dayjs(props.note.timestamp).format('MMM D, HH:mm')
})

const renderedContent = computed(() => {
  // 确保传入字符串
  return renderMarkdown(props.note.content || '')
})
</script>

<style lang="scss" scoped>
.note-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 16px;
  transition: all 0.2s;
  cursor: default;

  &:hover {
    border-color: var(--border-hover);

    // 鼠标悬停时显示操作按钮
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

.tag-spacer {
  margin: 0 6px;
}

.mini-tag {
  color: var(--text-secondary);
  margin-right: 6px;
}

.actions-group {
  display: flex;
  gap: 4px;
  opacity: 0; /* 默认隐藏，Hover 显示 */
  transition: opacity 0.2s;
}

.action-btn {
  padding: 4px;
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.danger:hover {
    background: #FEF2F2;
    color: var(--color-danger);
  }
}

.icon-xs {
  width: 14px;
  height: 14px;
}

/* Markdown Body Reset */
:deep(.markdown-body) {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);

  p { margin-bottom: 0.75em; }
  p:last-child { margin-bottom: 0; }

  ul, ol { padding-left: 1.5em; margin-bottom: 0.75em; }

  /* 简单的 wiki-link 样式 */
  .wiki-link {
    color: var(--color-brand);
    font-weight: 500;
    cursor: pointer;
    background: var(--color-brand-light);
    padding: 0 4px;
    border-radius: 4px;
  }

  code {
    background: var(--color-code-bg);
    padding: 2px 5px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }
}
</style>