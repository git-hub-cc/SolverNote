<template>
  <div class="app-layout">
    <!-- 左侧导航 -->
    <NavigationRail class="layout-nav" />

    <!-- 中间主内容区 (路由视图) -->
    <main class="layout-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 右侧 AI 侧边栏 -->
    <SolverSidebar class="layout-sidebar" />
  </div>
</template>

<script setup>
import { watch, onMounted, onUnmounted } from 'vue' // 引入 onMounted 和 onUnmounted
import NavigationRail from '@/components/layout/NavigationRail.vue'
import SolverSidebar from '@/components/layout/SolverSidebar.vue'
import { useNoteStore } from '@/stores/noteStore'
import { useSolverStore } from '@/stores/solverStore'

const noteStore = useNoteStore()
const solverStore = useSolverStore()

// --- 核心联动逻辑 ---
// 当用户在中间选中一条笔记时，通知右侧 AI 进行分析
watch(
    () => noteStore.selectedNoteId,
    (newId) => {
      solverStore.analyzeContext(newId)
    }
)

// --- [新增] 生命周期钩子，用于设置和清理IPC监听器 ---
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
}

.layout-main {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0; /* 防止 flex 子项溢出 */
}

.layout-sidebar {
  flex-shrink: 0;
  width: 320px;
  border-left: 1px solid var(--border-light);
  background-color: var(--bg-card);
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