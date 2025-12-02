<template>
  <aside class="nav-rail">
    <!-- 1. 头部区域 -->
    <div class="nav-header">
      <BrainIcon class="icon brand-icon" />
      <span class="brand-text">SolverNote</span>
    </div>

    <!-- 2. 系统菜单 -->
    <div class="nav-group-title">System</div>
    <nav class="nav-menu">
      <router-link to="/settings" class="nav-item">
        <SettingsIcon class="icon" />
        <span>Settings</span>
      </router-link>
    </nav>

    <!-- 3. 主导航菜单 -->
    <div class="nav-group-title">Workspace</div>
    <nav class="nav-menu">
      <a
          href="#"
          class="nav-item"
          :class="{ 'router-link-active': isHomeActive }"
          @click.prevent="handleGoHome"
      >
        <CalendarIcon class="icon" />
        <span>Today</span>
      </a>

      <!-- 搜索框 -->
      <div class="search-wrapper" :class="{ focused: isSearchFocused }">
        <SearchIcon class="icon search-icon" />
        <input
            type="text"
            placeholder="Search..."
            v-model="searchQuery"
            @focus="isSearchFocused = true"
            @blur="isSearchFocused = false"
        />
        <button v-if="searchQuery" @click="clearSearch" class="clear-btn">×</button>
      </div>

      <router-link to="/tags" class="nav-item">
        <HashIcon class="icon" />
        <span>Tags</span>
      </router-link>
    </nav>

    <!-- 4. 文件目录树 -->
    <FileTreeView class="file-tree-section" />

  </aside>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useNoteStore } from '@/stores/noteStore'
import { useRouter, useRoute } from 'vue-router'
import FileTreeView from './FileTreeView.vue'
import {
  Brain as BrainIcon,
  Calendar as CalendarIcon,
  Search as SearchIcon,
  Hash as HashIcon,
  Settings as SettingsIcon
} from 'lucide-vue-next'

const noteStore = useNoteStore()
const isSearchFocused = ref(false)
let debounceTimer = null

const router = useRouter()
const route = useRoute()

// --- 响应式状态 ---

// [核心修改] searchQuery 现在是一个计算属性，具有 getter 和 setter。
// getter: 直接从 store 读取 searchQuery，确保输入框与 store 状态同步。
// setter: 调用 store 的 setSearchQuery action，这是触发文本搜索的唯一入口。
const searchQuery = computed({
  get: () => noteStore.searchQuery,
  set: (value) => {
    noteStore.setSearchQuery(value)
  }
})

// --- 计算属性 ---

// 检查当前是否在主页 (Today)
const isHomeActive = computed(() => {
  // 当路由是主页，并且没有任何筛选条件时，才高亮 "Today"。
  return route.path === '/' && !noteStore.searchQuery && !noteStore.activeTagFilter
})

// --- 侦听器 ---

// [修改] 移除原有的 watch，因为 computed setter 已经处理了更新逻辑。
// 这种方式更符合 Pinia 的最佳实践，使组件的本地状态与 store 状态保持一致。

// --- 方法 ---

// 清空搜索框内容
const clearSearch = () => {
  // 直接将计算属性设为空字符串，会触发 setter，从而更新 store。
  searchQuery.value = ''
}

/**
 * [核心修改] "Today" 链接的点击事件处理器。
 * 现在负责清除所有类型的筛选条件。
 */
const handleGoHome = () => {
  // 1. 调用 store 中新增的 clearFilters action，
  //    该 action 会同时重置 searchQuery 和 activeTagFilter。
  noteStore.clearFilters()

  // 2. 导航到主页。
  router.push('/')
}
</script>

<style lang="scss" scoped>
/* 样式无变化 */
.nav-rail {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-sidebar);
  overflow-y: auto;
  &::-webkit-scrollbar {
    display: none;
  }
}

.nav-header {
  margin-bottom: 24px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;

  .brand-icon {
    color: var(--color-brand);
  }
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &.router-link-active {
    background-color: var(--bg-active);
    color: var(--text-primary);
  }
}

.nav-group-title {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-tertiary);
  letter-spacing: 0.05em;
  padding: 0 12px;
  margin-top: 24px;
  margin-bottom: 8px;

  &:first-of-type {
    margin-top: 0;
  }
}

.search-wrapper {
  margin: 4px 0;
  display: flex;
  align-items: center;
  background: var(--bg-hover);
  border-radius: 6px;
  padding: 6px 8px;
  border: 1px solid transparent;
  transition: all 0.2s;

  &.focused {
    background: var(--bg-card);
    border-color: var(--color-brand);
    box-shadow: 0 0 0 2px var(--bg-active);
  }

  .search-icon {
    width: 14px;
    height: 14px;
    color: var(--text-tertiary);
    margin-right: 6px;
  }

  input {
    width: 100%;
    font-size: 13px;
    color: var(--text-primary);
    &::placeholder { color: var(--text-tertiary); }
  }

  .clear-btn {
    cursor: pointer;
    font-size: 14px;
    color: var(--text-tertiary);
    &:hover { color: var(--text-secondary); }
  }
}

.file-tree-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>