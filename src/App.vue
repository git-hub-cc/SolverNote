<template>
  <!-- 应用的根布局容器，采用 flex 布局 -->
  <div class="app-layout">
    <!-- 1. 左侧导航栏 (固定宽度) -->
    <NavigationRail class="layout-nav" />

    <!-- 2. 中间主内容区域 (可伸缩) -->
    <main class="layout-main">
      <!-- 侧边栏折叠时，显示一个“展开”按钮 -->
      <transition name="fade">
        <button v-if="!isSidebarOpen" class="sidebar-toggle-btn" @click="toggleSidebar" title="打开 AI 侧边栏">
          <PanelRightOpenIcon class="icon" />
        </button>
      </transition>

      <!-- 路由视图，用于显示 StreamTimeline, SingleNoteView 等页面 -->
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 3. 右侧 AI 侧边栏 (宽度可变) -->
    <div class="sidebar-wrapper" :class="{ 'is-collapsed': !isSidebarOpen }">
      <SolverSidebar class="layout-sidebar" @close="isSidebarOpen = false" />
    </div>

    <!-- [原有] 全局撤销提示框组件 (位于右下角) -->
    <UndoToast />

    <!-- [新增] 全局通用通知组件 (位于顶部居中) -->
    <NotificationToast />

  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import NavigationRail from '@/components/layout/NavigationRail.vue'
import SolverSidebar from '@/components/layout/SolverSidebar.vue'
import UndoToast from '@/components/common/UndoToast.vue'
// [新增] 引入通用通知组件
import NotificationToast from '@/components/common/NotificationToast.vue'
import { useSolverStore } from '@/stores/solverStore'
import { useUIStore } from '@/stores/uiStore'
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next'

// --- 状态管理 ---
const solverStore = useSolverStore()
const uiStore = useUIStore()
const route = useRoute()

// 响应式状态：控制右侧 AI 侧边栏的展开/折叠
const isSidebarOpen = ref(true)

// --- 方法 ---
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

// --- 侦听器 (Watchers) ---
watch(() => route.name, (routeName) => {
  if (routeName === 'note-view') {
    isSidebarOpen.value = true
  }
});

watch(() => uiStore.effectiveTheme, (newTheme) => {
  const root = document.documentElement;
  if (newTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}, { immediate: true });

watch(() => uiStore.themePreference, (newPreference) => {
  if (window.electronAPI && window.electronAPI.setNativeTheme) {
    window.electronAPI.setNativeTheme(newPreference);
  }
}, { immediate: true });

// --- 生命周期钩子 ---
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
  position: relative;
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
  min-width: 200px;
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
  border-left-color: transparent;
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