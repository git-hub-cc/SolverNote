<template>
  <div class="app-layout">
    <NavigationRail class="layout-nav" />
    <main class="layout-main">
      <transition name="fade">
        <button v-if="!isSidebarOpen" class="sidebar-toggle-btn" @click="toggleSidebar" title="打开 AI 侧边栏">
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
    <UndoToast />
    <NotificationToast />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import NavigationRail from '@/components/layout/NavigationRail.vue';
import SolverSidebar from '@/components/layout/SolverSidebar.vue';
import UndoToast from '@/components/common/UndoToast.vue';
import NotificationToast from '@/components/common/NotificationToast.vue';
import { useSolverStore } from '@/stores/solverStore';
import { useUIStore } from '@/stores/uiStore';
import { PanelRightOpen as PanelRightOpenIcon } from 'lucide-vue-next';

const solverStore = useSolverStore();
const uiStore = useUIStore();
const route = useRoute();
const isSidebarOpen = ref(true);

const toggleSidebar = () => { isSidebarOpen.value = !isSidebarOpen.value; };

watch(() => route.name, (routeName) => {
  if (routeName === 'note-view') isSidebarOpen.value = true;
});

// [日志] 主题切换逻辑
watch(() => uiStore.effectiveTheme, (newTheme) => {
  const root = document.documentElement;
  if (newTheme === 'dark') {
    console.log('[App.vue] Applying dark theme. Adding "dark" class to <html>.');
    root.classList.add('dark');
  } else {
    console.log('[App.vue] Applying light theme. Removing "dark" class from <html>.');
    root.classList.remove('dark');
  }
}, { immediate: true });

watch(() => uiStore.themePreference, (newPreference) => {
  if (window.electronAPI?.setNativeTheme) {
    window.electronAPI.setNativeTheme(newPreference);
  }
}, { immediate: true });

onMounted(() => {
  console.log('[App.vue] Component mounted, setting up listeners and initializing theme.');
  solverStore.setupListeners();
  uiStore.initializeTheme();
});

onUnmounted(() => {
  console.log('[App.vue] Component unmounted, cleaning up listeners.');
  solverStore.cleanupListeners();
  uiStore.cleanup();
});
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
  min-width: 600px;
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