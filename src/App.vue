<template>
  <div class="app-layout">
    <!-- 左侧导航 -->
    <NavigationRail class="layout-nav" />

    <!-- 中间主内容区 -->
    <main class="layout-main">
      <!--
        [新增] 侧边栏打开按钮
        仅当侧边栏关闭时显示，绝对定位在右上角
      -->
      <transition name="fade">
        <button
            v-if="!isSidebarOpen"
            class="sidebar-toggle-btn"
            @click="toggleSidebar"
            title="Open AI Sidebar"
        >
          <PanelRightOpenIcon class="icon" />
        </button>
      </transition>

      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 右侧 AI 侧边栏 -->
    <!--
      [修改] 使用动态类名控制宽度，而不是 v-if，以支持 CSS transition
    -->
    <div class="sidebar-wrapper" :class="{ 'is-collapsed': !isSidebarOpen }">
      <SolverSidebar
          class="layout-sidebar"
          @close="isSidebarOpen = false"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import NavigationRail from '@/components/layout/NavigationRail.vue'
import SolverSidebar from '@/components/layout/SolverSidebar.vue'
import { useNoteStore } from '@/stores/noteStore'
import { useSolverStore } from '@/stores/solverStore'
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next' // [新增] 引入图标

const noteStore = useNoteStore()
const solverStore = useSolverStore()

// [新增] 控制侧边栏状态
const isSidebarOpen = ref(true)

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

// 核心联动逻辑
watch(
    () => noteStore.selectedNoteId,
    (newId) => {
      // [新增] 当用户选中笔记时，自动打开侧边栏 (符合直觉的交互)
      if (newId) {
        isSidebarOpen.value = true
        solverStore.analyzeContext(newId)
      } else {
        // 可选：当取消选中时，是否自动关闭？通常保持打开或维持原状更好。
        // 这里维持原状，不做操作。
      }
    }
)

onMounted(() => {
  solverStore.setupListeners()
})

onUnmounted(() => {
  solverStore.cleanupListeners()
})
</script>

<style scoped>
/* App 级布局容器 */
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
  z-index: 10; /* 确保层级 */
}

.layout-main {
  flex: 1;
  position: relative; /* 为绝对定位的 Toggle 按钮提供锚点 */
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* [新增] 侧边栏包装器 & 动画逻辑 */
.sidebar-wrapper {
  flex-shrink: 0;
  width: 320px; /* 默认宽度 */
  overflow: hidden; /* 隐藏折叠时的内容 */
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 平滑过渡 */
  border-left: 1px solid var(--border-light);
  background-color: var(--bg-card);
}

.sidebar-wrapper.is-collapsed {
  width: 0;
  border-left: 1px solid transparent; /* 折叠时隐藏边框 */
}

/* 强制 Sidebar 保持宽度，防止折叠时内容被挤压 */
.layout-sidebar {
  width: 320px;
  height: 100%;
}

/* [新增] 悬浮打开按钮样式 */
.sidebar-toggle-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 50; /* 确保在编辑器之上 */
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

/* 简单的路由切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>