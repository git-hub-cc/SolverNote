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
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import NavigationRail from '@/components/layout/NavigationRail.vue'
import SolverSidebar from '@/components/layout/SolverSidebar.vue'
import { useSolverStore } from '@/stores/solverStore'
import { useUIStore } from '@/stores/uiStore'
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next'

// --- 状态管理 ---
const solverStore = useSolverStore()
const uiStore = useUIStore()
const route = useRoute() // 获取当前路由信息

// 响应式状态：控制右侧 AI 侧边栏的展开/折叠
const isSidebarOpen = ref(true)

// --- 方法 ---

/**
 * 切换 AI 侧边栏的显示状态。
 */
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

// --- 侦听器 (Watchers) ---

/**
 * [鲁棒性设计] 路由驱动的侧边栏行为。
 * 当用户通过文件树或卡片导航到单个笔记页面时，自动展开 AI 侧边栏，
 * 以便立即展示与该笔记相关的上下文信息。
 */
watch(() => route.name, (routeName) => {
  if (routeName === 'note-view') {
    isSidebarOpen.value = true
  }
});

/**
 * 侦听 UI Store 中计算出的最终主题 ('light' 或 'dark')。
 * 当主题变化时，动态地为 <html> 根元素添加或移除 'dark' 类，
 * 从而触发全局 CSS 变量的变化，实现无刷新主题切换。
 */
watch(() => uiStore.effectiveTheme, (newTheme) => {
  const root = document.documentElement;
  if (newTheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}, {
  immediate: true // 立即执行一次，确保初始加载时主题正确
});

/**
 * 侦听用户的主题偏好设置 ('system', 'light', 'dark')。
 * 当用户更改偏好时，通过 Electron API 通知主进程，
 * 以便主进程可以相应地调整原生窗口的主题（例如标题栏）。
 */
watch(() => uiStore.themePreference, (newPreference) => {
  if (window.electronAPI && window.electronAPI.setNativeTheme) {
    window.electronAPI.setNativeTheme(newPreference);
  }
}, {
  immediate: true // 立即执行一次
});

// --- 生命周期钩子 ---

onMounted(async () => {
  // 组件挂载后，初始化所有需要的监听器
  solverStore.setupListeners(); // 设置 AI 相关的 IPC 监听
  uiStore.initializeTheme();    // 初始化主题管理
})

onUnmounted(() => {
  // 组件卸载前，清理所有监听器，防止内存泄漏
  solverStore.cleanupListeners();
  uiStore.cleanup();
})
</script>

<style scoped>
/*
 * 整体三栏布局样式
 * - display: flex; 建立 flex 容器
 * - height: 100vh; width: 100vw; 占满整个视口
 * - overflow: hidden; 防止出现不必要的滚动条
 */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-app);
  color: var(--text-primary);
}

/* 左侧导航栏样式 */
.layout-nav {
  flex-shrink: 0; /* 防止被压缩 */
  width: 240px;
  border-right: 1px solid var(--border-light);
  z-index: 10;
  background-color: var(--bg-sidebar);
}

/* 中间主内容区样式 */
.layout-main {
  flex: 1; /* 占据所有剩余空间 */
  position: relative;
  display: flex;
  flex-direction: column;
  /*
   * [核心修改] 为主内容区设置最小宽度。
   * 这是为了防止在窗口宽度非常窄时，主内容区域被 flex 布局完全压缩，
   * 导致内容无法阅读。200px 是一个比较合理的最小宽度值。
   * 此修改具有良好的鲁棒性和最小侵入性，仅影响布局约束。
   */
  min-width: 200px;
}

/* 右侧 AI 侧边栏的包裹容器样式 */
.sidebar-wrapper {
  flex-shrink: 0; /* 防止被压缩 */
  width: 320px;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 平滑的宽度变化动画 */
  border-left: 1px solid var(--border-light);
  background-color: var(--bg-card);
}

/* 当侧边栏折叠时的样式 */
.sidebar-wrapper.is-collapsed {
  width: 0;
  border-left-color: transparent; /* 隐藏边框 */
}

/* 侧边栏内部组件的样式 */
.layout-sidebar {
  width: 320px; /* 确保内部组件宽度与外部容器一致 */
  height: 100%;
}

/* 侧边栏展开/折叠按钮样式 */
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

/* 渐变过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>