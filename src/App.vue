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
import { useUIStore } from '@/stores/uiStore' // 引入 UI store
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next'

const noteStore = useNoteStore()
const solverStore = useSolverStore()
const uiStore = useUIStore() // 实例化 UI store

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

// 侦听最终生效的主题 (`effectiveTheme`)，并更新 `<html>` class 以应用 CSS 变量。
watch(() => uiStore.effectiveTheme, (newTheme) => {
  const root = document.documentElement;
  if (newTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}, {
  immediate: true // 立即执行一次，确保应用加载时主题正确
});


/**
 * [核心新增] 侦听用户的偏好设置 (`themePreference`)。
 * 当用户在设置页面更改偏好时 (例如从 'system' 改为 'dark')，
 * 这个侦听器会被触发，并将新的偏好设置发送给主进程，
 * 以便主进程更新原生窗口（标题栏）的主题。
 */
watch(() => uiStore.themePreference, (newPreference) => {
  // 检查 Electron API 是否存在，确保在浏览器环境中不会报错
  if (window.electronAPI && window.electronAPI.setNativeTheme) {
    window.electronAPI.setNativeTheme(newPreference);
  }
}, {
  immediate: true // 立即执行一次，确保应用启动时主进程的主题与渲染进程同步
});


onMounted(async () => {
  solverStore.setupListeners();

  // 调用 uiStore 的初始化方法，它会处理所有与 Electron 的通信
  uiStore.initializeTheme();
})

onUnmounted(() => {
  solverStore.cleanupListeners();

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