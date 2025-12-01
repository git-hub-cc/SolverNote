<template>
  <article
      class="note-card"
      :class="{ 'is-selected': isSelected }"
      @click="navigateToNote"
  >
    <!--
      卡片的点击事件 `@click` 现在调用 `navigateToNote` 方法，
      该方法将使用 Vue Router 进行页面跳转到笔记的预览视图。
    -->

    <!-- Meta Info: 时间和标签 -->
    <div class="note-header">
      <div class="meta-left">
        <span class="note-time">{{ formattedTime }}</span>
        <span v-if="note.tags && note.tags.length" class="tag-spacer">·</span>
        <div class="mini-tags" v-if="note.tags">
          <span v-for="tag in note.tags" :key="tag" class="mini-tag">#{{ tag }}</span>
        </div>
      </div>

      <!--
        操作按钮的点击事件通过 `@click.stop` 阻止了事件冒泡。
        这非常重要，因为它能防止点击“编辑”或“删除”按钮时，
        意外触发父元素 `article` 的 `navigateToNote` 跳转事件。
      -->
      <div class="actions-group" @click.stop>
        <!--
          [核心重构] 编辑按钮现在调用 handleEdit 方法，
          该方法将导航到单页视图的编辑模式。
        -->
        <button class="action-btn" @click="handleEdit" title="Edit this note">
          <Edit2Icon class="icon-xs" />
        </button>
        <button class="action-btn danger" @click="$emit('delete', note.id)" title="Delete">
          <Trash2Icon class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- Content Body: 渲染后的 Markdown 内容 -->
    <div class="markdown-body" v-html="renderedContent"></div>

  </article>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router'; // 引入 useRouter
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

// [核心重构] 不再需要 'edit' 事件，因为导航是组件内部的行为
defineEmits(['delete']);

const router = useRouter(); // 实例化 router

const formattedTime = computed(() => {
  return dayjs(props.note.timestamp).format('MMM D, HH:mm');
});

const renderedContent = computed(() => {
  return renderMarkdown(props.note.content || '');
});

/**
 * 导航到笔记的预览视图。
 * 当用户点击卡片的任何非按钮区域时触发。
 */
const navigateToNote = () => {
  router.push({
    name: 'note-view', // 导航到命名路由 'note-view'
    params: { noteId: props.note.id } // 传递笔记ID作为路由参数
  });
};

/**
 * [核心重构] 处理编辑按钮点击事件。
 * 它将导航到同一个单页视图，但附加一个查询参数来触发编辑模式。
 */
const handleEdit = () => {
  router.push({
    name: 'note-view',
    params: { noteId: props.note.id },
    query: { edit: 'true' } // 附加查询参数，通知目标页面直接进入编辑状态
  });
};

</script>

<style lang="scss" scoped>
.note-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 16px;
  transition: all 0.2s;
  cursor: pointer; /* 将光标改为 pointer，提示用户这是一个可点击的链接 */

  &:hover {
    border-color: var(--border-hover);
    box-shadow: var(--shadow-card);
    .actions-group {
      opacity: 1;
    }
  }

  /* is-selected 样式用于视觉反馈，表示“这是当前URL对应的笔记” */
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

:deep(.markdown-body) {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  p { margin-bottom: 0.75em; }
  p:last-child { margin-bottom: 0; }
  ul, ol { padding-left: 1.5em; margin-bottom: 0.75em; }
  code { background: var(--color-code-bg); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.9em; }
  .wiki-link { color: var(--color-brand); font-weight: 500; cursor: pointer; background: var(--color-brand-light); padding: 0 4px; border-radius: 4px; }
}
</style>