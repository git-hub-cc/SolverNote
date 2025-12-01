<template>
  <aside class="nav-rail">
    <!-- 1. 头部区域 -->
    <div class="nav-header">
      <BrainIcon class="icon brand-icon" />
      <span class="brand-text">SolverNote</span>
    </div>

    <!-- 2. 系统菜单 (调整至顶部) -->
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

    <!-- 4. [新增] 文件目录树 -->
    <FileTreeView class="file-tree-section" />

  </aside>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useNoteStore } from '@/stores/noteStore'
import { useRouter, useRoute } from 'vue-router'
// 核心修改: 引入新建的文件树组件
import FileTreeView from './FileTreeView.vue'
import {
  Brain as BrainIcon,
  Calendar as CalendarIcon,
  Search as SearchIcon,
  Hash as HashIcon,
  Settings as SettingsIcon
} from 'lucide-vue-next'

const noteStore = useNoteStore()
const searchQuery = ref('')
const isSearchFocused = ref(false)
let debounceTimer = null

const router = useRouter()
const route = useRoute()

// 检查当前是否在主页 (Today)
const isHomeActive = computed(() => route.path === '/')

// 监听搜索框输入，防抖后更新 store
watch(searchQuery, (newVal) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    noteStore.setSearchQuery(newVal)
  }, 300)
})

// 清空搜索框内容
const clearSearch = () => {
  searchQuery.value = ''
}

// "Today" 链接的点击事件处理器
// 点击后清空搜索条件并跳转到主页
const handleGoHome = () => {
  noteStore.setSearchQuery('')
  searchQuery.value = '' // 同时清空本地输入框
  router.push('/')
}
</script>

<style lang="scss" scoped>
.nav-rail {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-sidebar);
  // 新增: 让侧边栏内容超出时可以滚动
  overflow-y: auto;
  // 新增: 隐藏默认滚动条，但保留功能
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
  flex-shrink: 0; // 防止头部被压缩

  .brand-icon {
    color: var(--color-brand);
  }
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0; // 防止菜单被压缩
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

  // 第一个标题不需要上边距
  &:first-of-type {
    margin-top: 0;
  }
}

/* 搜索框样式 */
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

// [新增] 文件树区域的样式
.file-tree-section {
  // 让文件树填满剩余空间
  flex: 1;
  min-height: 0; // flex 布局中允许内容滚动的关键
  display: flex;
  flex-direction: column;
}
</style>