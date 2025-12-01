<template>
  <div class="app-layout">
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
import { useRoute } from 'vue-router' // [新增] 引入 useRoute
import NavigationRail from '@/components/layout/NavigationRail.vue'
import SolverSidebar from '@/components/layout/SolverSidebar.vue'
import { useSolverStore } from '@/stores/solverStore'
import { useUIStore } from '@/stores/uiStore'
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next'

const solverStore = useSolverStore()
const uiStore = useUIStore()
const route = useRoute() // [新增] 实例化 route

const isSidebarOpen = ref(true)

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}


// --- [核心修改] 移除旧的全局联动逻辑 ---
// watch(() => noteStore.selectedNoteId, (newId) => { ... })
// 上述侦听器已被移除。现在，AI 上下文的分析由各个视图组件 (StreamTimeline.vue 和 SingleNoteView.vue)
// 根据当前的路由和用户操作来独立触发，使得逻辑更加清晰和解耦。


// --- [新增] 路由驱动的侧边栏行为 ---
// 侦听路由变化，当用户进入单个笔记页面时，自动打开 AI 侧边栏，以便展示智能关联。
watch(() => route.name, (routeName) => {
  if (routeName === 'note-view') {
    isSidebarOpen.value = true
  }
});


// --- 主题管理逻辑 (无变化) ---
watch(() => uiStore.effectiveTheme, (newTheme) => {
  const root = document.documentElement;
  if (newTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}, {
  immediate: true
});

watch(() => uiStore.themePreference, (newPreference) => {
  if (window.electronAPI && window.electronAPI.setNativeTheme) {
    window.electronAPI.setNativeTheme(newPreference);
  }
}, {
  immediate: true
});

// --- 生命周期钩子 (无变化) ---
onMounted(async () => {
  solverStore.setupListeners();
  uiStore.initializeTheme();
})

onUnmounted(() => {
  solverStore.cleanupListeners();
  uiStore.cleanup();
})
</script>

<style scoped>
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