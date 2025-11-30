<template>
  <aside class="nav-rail">
    <!-- Header -->
    <div class="nav-header">
      <BrainIcon class="icon brand-icon" />
      <span class="brand-text">SolverNote</span>
    </div>

    <!-- Main Menu -->
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

    <!-- System Menu -->
    <div class="nav-group-title">System</div>
    <nav class="nav-menu">
      <router-link to="/settings" class="nav-item">
        <SettingsIcon class="icon" />
        <span>Settings</span>
      </router-link>
    </nav>
  </aside>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useNoteStore } from '@/stores/noteStore'
import { useRouter, useRoute } from 'vue-router'
import { Brain as BrainIcon, Calendar as CalendarIcon, Search as SearchIcon, Hash as HashIcon, Settings as SettingsIcon } from 'lucide-vue-next'

const noteStore = useNoteStore()
const searchQuery = ref('')
const isSearchFocused = ref(false)
let debounceTimer = null

const router = useRouter()
const route = useRoute()

const isHomeActive = computed(() => route.path === '/')

// 监听输入并防抖触发 Store 搜索
watch(searchQuery, (newVal) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    noteStore.setSearchQuery(newVal)
  }, 300)
})

const clearSearch = () => {
  searchQuery.value = ''
}

// "Today" 链接的点击事件处理器
const handleGoHome = () => {
  noteStore.setSearchQuery('')
  router.push('/')
}
</script>

<style lang="scss" scoped>
.nav-rail {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  /* 导航栏使用独立的背景色，确保在深色模式下能与主区域区分 */
  background-color: var(--bg-sidebar);
}

.nav-header {
  margin-bottom: 24px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);

  .brand-icon {
    color: var(--color-brand);
  }
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
    /* [核心修改 1/2] 使用 var(--bg-card) 替代 #fff，以适配深色模式 */
    background: var(--bg-card);
    border-color: var(--color-brand);
    /* [核心修改 2/2] 使用 var(--bg-active) 作为光晕颜色，确保在两种主题下都可见且不突兀 */
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
</style>