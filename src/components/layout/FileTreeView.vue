<template>
  <div class="file-tree-view">
    <!-- 1. 可折叠的标题区域 -->
    <div class="nav-group-title tree-header" @click="toggleExpansion">
      <span>文件</span>
      <!-- 折叠图标，根据 isExpanded 状态旋转 -->
      <ChevronRightIcon class="icon-xs chevron-icon" :class="{ 'is-expanded': isExpanded }" />
    </div>

    <!-- 2. 文件列表 (v-if 控制显示) -->
    <nav v-if="isExpanded" class="note-list">
      <!-- 列表为空时的提示 -->
      <div v-if="allNotes.length === 0" class="empty-list-msg">
        无笔记。
      </div>

      <!--
        [核心修改] 遍历笔记并生成 <router-link>
        - `:to` 属性被绑定到一个对象，指向我们新定义的 'note-view' 命名路由。
        - `params: { noteId: note.id }` 将笔记的ID作为路由参数传递，
          这样路由系统就能生成正确的 URL，例如 `#/notes/note-12345.md`。
        - 这个链接会激活 SingleNoteView 组件并传入 noteId。
      -->
      <router-link
          v-else
          v-for="note in allNotes"
          :key="note.id"
          :to="{ name: 'note-view', params: { noteId: note.id } }"
          class="note-item"
          :title="note.title || note.id"
      >
        <!-- 笔记标题，如果标题不存在则显示文件名作为后备 -->
        <span class="note-name">{{ note.title || note.id }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useNoteStore } from '@/stores/noteStore';
import { ChevronRight as ChevronRightIcon } from 'lucide-vue-next';

// 实例化笔记 store
const noteStore = useNoteStore();

// 控制文件列表是否展开的本地状态
const isExpanded = ref(true);

/**
 * 切换列表的展开/折叠状态
 */
const toggleExpansion = () => {
  isExpanded.value = !isExpanded.value;
};

/**
 * [鲁棒性关键] 从 store 的完整缓存中获取所有笔记
 * `_allNotesCache` 不受前端搜索过滤的影响，确保文件列表始终是完整的，
 * 即使在主视图中进行了搜索，这里的文件树依然展示所有文件。
 */
const allNotes = computed(() => noteStore._allNotesCache);

</script>

<style lang="scss" scoped>
.file-tree-view {
  display: flex;
  flex-direction: column;
  // 确保在父容器中能正确地占据剩余空间
  flex: 1;
  min-height: 0;
}

// 继承并扩展自 NavigationRail 的标题样式
.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;

  &:hover {
    color: var(--text-secondary);
  }

  .chevron-icon {
    transition: transform 0.2s ease-in-out;
  }

  // 展开时旋转90度
  .chevron-icon.is-expanded {
    transform: rotate(90deg);
  }
}

// 文件列表容器
.note-list {
  // 让列表在有限空间内滚动
  flex: 1;
  overflow-y: auto;
  padding-right: 4px; // 为滚动条留出空间
  margin-top: 4px;

  // 滚动条美化
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 2px; }
}

// 单个文件项
.note-item {
  display: block;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  border-radius: 4px;
  text-decoration: none;
  transition: all 0.2s;
  // 处理长文件名
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  // 当前路由匹配时的激活样式
  // `router-link-exact-active` 是 Vue Router 自动添加的 class
  &.router-link-exact-active {
    background-color: var(--bg-active);
    color: var(--text-primary);
    font-weight: 500;
  }
}

// 列表为空时的提示
.empty-list-msg {
  padding: 6px 12px;
  font-size: 12px;
  font-style: italic;
  color: var(--text-tertiary);
}

.icon-xs {
  width: 14px;
  height: 14px;
}
</style>