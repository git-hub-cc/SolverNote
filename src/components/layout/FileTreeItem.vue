<template>
  <div class="tree-item-wrapper">
    <!--
      节点行 (Item Row)
      - draggable: 允许拖拽
      - drop zone: 允许其他项放入（如果是文件夹）
    -->
    <div
        class="tree-item-row"
        :class="{
        'is-active': isActive,
        'is-drag-over': isDragOver,
        'is-folder': item.type === 'folder'
      }"
        :draggable="true"
        @click="handleItemClick"
        @contextmenu.prevent="handleContextMenu"
        @dragstart="handleDragStart"
        @dragover.prevent="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
      <!-- 缩进线 / 展开图标 -->
      <span class="indent-spacer" :style="{ width: `${depth * 12}px` }"></span>

      <span v-if="item.type === 'folder'" class="folder-toggle">
        <ChevronRightIcon
            class="icon-xs chevron"
            :class="{ 'rotated': isExpanded }"
        />
      </span>
      <span v-else class="file-icon-placeholder"></span>

      <!-- 名称 -->
      <span class="item-name" :title="item.name">
        {{ item.name }}
      </span>
    </div>

    <!-- 子节点容器 (仅文件夹有) -->
    <div v-if="item.type === 'folder' && isExpanded" class="tree-children">
      <!-- 递归调用自身 -->
      <FileTreeItem
          v-for="child in sortedChildren"
          :key="child.id"
          :item="child"
          :depth="depth + 1"
          @context-menu="$emit('context-menu', $event)"
          @move-item="$emit('move-item', $event)"
      />
      <!-- 空文件夹提示 -->
      <div v-if="!item.children || item.children.length === 0" class="empty-folder-msg" :style="{ paddingLeft: `${(depth + 2) * 12}px` }">
        (empty)
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronRight as ChevronRightIcon } from 'lucide-vue-next';

const props = defineProps({
  item: { type: Object, required: true },
  depth: { type: Number, default: 0 }
});

const emit = defineEmits(['context-menu', 'move-item']);
const route = useRoute();
const router = useRouter();

// --- 状态 ---
const isExpanded = ref(false); // 文件夹展开状态
const isDragOver = ref(false); // 拖拽悬停状态

// --- 计算属性 ---
const isActive = computed(() => {
  // 检查当前路由是否匹配该文件 ID
  if (props.item.type === 'file' && route.name === 'note-view') {
    // 简单的 ID 匹配 (注意 URL 编码)
    return route.params.noteId === props.item.id;
  }
  return false;
});

const sortedChildren = computed(() => {
  if (!props.item.children) return [];
  // 文件夹排在前面，然后按名称排序
  return [...props.item.children].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });
});

// --- 事件处理 ---

const handleItemClick = () => {
  if (props.item.type === 'folder') {
    isExpanded.value = !isExpanded.value;
  } else {
    // 导航到笔记
    // [关键] 对 ID 进行 encodeURIComponent，防止路径中的 '/' 破坏路由
    // 但在我们的 Router 配置中，我们通常希望 '/' 是路径分隔符
    // 所以这里的处理依赖于 router 的 path 配置。
    // 如果 router 配置为 path: '/notes/:noteId(.*)*'，则可以直接传 ID
    router.push({ name: 'note-view', params: { noteId: props.item.id } });
  }
};

const handleContextMenu = (e) => {
  // 向上冒泡右键事件，携带当前项信息
  emit('context-menu', {
    event: e,
    item: props.item
  });
};

// --- 拖拽逻辑 ---

const handleDragStart = (e) => {
  e.stopPropagation();
  // 设置拖拽数据：源文件 ID
  e.dataTransfer.setData('application/json', JSON.stringify({
    id: props.item.id,
    type: props.item.type
  }));
  e.dataTransfer.effectAllowed = 'move';
};

const handleDragOver = (e) => {
  // 只有文件夹允许 Drop
  if (props.item.type === 'folder') {
    isDragOver.value = true;
    e.dataTransfer.dropEffect = 'move';
  }
};

const handleDragLeave = () => {
  isDragOver.value = false;
};

const handleDrop = (e) => {
  isDragOver.value = false;
  if (props.item.type !== 'folder') return;

  try {
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const sourceId = data.id;
    const targetDir = props.item.id; // 目标文件夹的 ID (即相对路径)

    // 防止自己拖给自己
    if (sourceId !== targetDir) {
      emit('move-item', { sourceId, targetDir });
    }
  } catch (err) {
    console.error('Drop error:', err);
  }
};
</script>

<style lang="scss" scoped>
.tree-item-wrapper {
  user-select: none;
}

.tree-item-row {
  display: flex;
  align-items: center;
  padding: 4px 8px 4px 0;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  transition: background-color 0.1s;
  border: 1px solid transparent;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &.is-active {
    background-color: var(--bg-active);
    color: var(--color-brand);
    font-weight: 500;
  }

  /* 拖拽悬停高亮 */
  &.is-drag-over {
    background-color: var(--bg-hover);
    border-color: var(--color-brand);
  }
}

.indent-spacer {
  display: inline-block;
  height: 100%;
  flex-shrink: 0;
}

.folder-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 4px;
}

.file-icon-placeholder {
  width: 16px;
  margin-right: 4px;
}

.chevron {
  transition: transform 0.2s;
  color: var(--text-tertiary);
  width: 14px;
  height: 14px;

  &.rotated {
    transform: rotate(90deg);
  }
}

.item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.empty-folder-msg {
  font-size: 11px;
  color: var(--text-tertiary);
  font-style: italic;
  padding: 4px 0;
}
</style>