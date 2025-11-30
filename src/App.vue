<template>
  <div class="app-layout">
    <!-- 模板部分保持不变 -->
    <NavigationRail class="layout-nav" />
    <main class="layout-main">
      <transition name="fade">
        <button v-if="!isSidebarOpen" class="sidebar-toggle-btn" @click="toggleSidebar" title="Open AI Sidebar">
          <PanelRightOpenIcon class="icon" />
        </button>
      </transition>
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <div class="sidebar-wrapper" :class="{ 'is-collapsed': !isSidebarOpen }">
      <SolverSidebar class="layout-sidebar" @close="isSidebarOpen = false" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import NavigationRail from '@/components/layout/NavigationRail.vue'
import SolverSidebar from '@/components/layout/SolverSidebar.vue'
import { useNoteStore } from '@/stores/noteStore'
import { useSolverStore } from '@/stores/solverStore'
import { useUIStore } from '@/stores/uiStore'
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next'

const noteStore = useNoteStore()
const solverStore = useSolverStore()
const uiStore = useUIStore()

const isSidebarOpen = ref(true)

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

// 核心联动逻辑 (保持不变)
watch(() => noteStore.selectedNoteId, (newId) => {
  if (newId) {
    isSidebarOpen.value = true
    solverStore.analyzeContext(newId)
  }
})

// --- [核心修改] 主题管理逻辑 ---

// [移除] 不再需要 `updateHljsTheme` 函数，因为主题切换现在是纯 CSS 实现。

// [修改] watch 回调现在变得极其简单，只负责在 <html> 标签上添加或移除 .dark 类。
watch(() => uiStore.effectiveTheme, (newTheme) => {
  const root = document.documentElement;
  if (newTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // [移除] 不再需要在这里调用 updateHljsTheme
}, {
  immediate: true
});

onMounted(async () => {
  solverStore.setupListeners();

  // (此部分保持不变)
  // 调用 uiStore 的初始化方法，它会处理所有与 Electron 的通信
  uiStore.initializeTheme();
})

onUnmounted(() => {
  solverStore.cleanupListeners();

  // (此部分保持不变)
  // 调用 uiStore 的清理方法
  uiStore.cleanup();
})
</script>

<style scoped>
/* (所有样式保持不变) */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-app);
  color: var(--text-primary);
}
.layout-nav {
  flex-shrink: 0;
  width: 240px;
  border-right: 1px solid var(--border-light);
  z-index: 10;
  background-color: var(--bg-sidebar);
}
.layout-main {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sidebar-wrapper {
  flex-shrink: 0;
  width: 320px;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 1px solid var(--border-light);
  background-color: var(--bg-card);
}
.sidebar-wrapper.is-collapsed {
  width: 0;
  border-left: 1px solid transparent;
}
.layout-sidebar {
  width: 320px;
  height: 100%;
}
.sidebar-toggle-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 50;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--bg-card);
  border: 1px solid var(--border-light);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-card);
  transition: all 0.2s;
}
.sidebar-toggle-btn:hover {
  background-color: var(--bg-hover);
  color: var(--color-brand);
  border-color: var(--border-hover);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>