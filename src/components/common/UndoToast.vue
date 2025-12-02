<template>
  <transition name="toast-slide">
    <div v-if="visible" class="undo-toast" @mouseenter="pauseTimer" @mouseleave="resumeTimer">
      <!-- 提示文本 -->
      <span class="toast-message">{{ message }}</span>

      <div class="toast-actions">
        <!-- 撤销按钮 -->
        <button class="undo-btn" @click="handleUndo">
          <RotateCcwIcon class="icon-sm" />
          {{ actionLabel }}
        </button>

        <!-- 关闭按钮 (X) -->
        <button class="close-btn" @click="handleClose">
          <XIcon class="icon-sm" />
        </button>
      </div>

      <!-- 倒计时进度条 -->
      <!-- 使用 key 来强制在每次显示时重启动画 -->
      <div
          class="progress-bar"
          :class="{ paused: isPaused }"
          :style="{ animationDuration: `${duration}ms` }"
          :key="animationKey"
          @animationend="handleAnimationEnd"
      ></div>
    </div>
  </transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useUIStore } from '@/stores/uiStore'
import { useNoteStore } from '@/stores/noteStore'
import { RotateCcw as RotateCcwIcon, X as XIcon } from 'lucide-vue-next'

const uiStore = useUIStore()
const noteStore = useNoteStore()

const isPaused = ref(false)
const animationKey = ref(0) // 用于重置 CSS 动画

// 从 Store 获取状态
const visible = computed(() => uiStore.toastState.visible)
const message = computed(() => uiStore.toastState.message)
const actionLabel = computed(() => uiStore.toastState.actionLabel)
const duration = computed(() => uiStore.toastState.duration)
const payload = computed(() => uiStore.toastState.actionPayload)

// --- 事件处理 ---

const handleUndo = () => {
  if (payload.value) {
    // 调用业务 Store 执行撤销
    noteStore.undoDelete(payload.value)
  } else {
    uiStore.hideToast()
  }
}

const handleClose = () => {
  uiStore.hideToast()
}

// 进度条走完时，表示用户没有撤销，UI 上可以自动关闭了
// 注意：真正的物理删除是由 noteStore 中的 setTimeout 控制的，
// 这里的动画只是为了给用户视觉反馈。
const handleAnimationEnd = () => {
  if (!isPaused.value) {
    uiStore.hideToast()
  }
}

// 鼠标悬停暂停 (仅暂停 UI 关闭，物理删除的定时器目前不做暂停处理以保持简单)
// 如果想做得更高级，可以通知 store 暂停 timer，这里为了保持逻辑简单，
// 我们主要用它来防止用户想点按钮时 Toast 突然消失。
const pauseTimer = () => { isPaused.value = true }
const resumeTimer = () => { isPaused.value = false }

// --- 侦听器 ---

// 每次 Toast 显示时，重置动画 Key
watch(visible, (newVal) => {
  if (newVal) {
    animationKey.value++
    isPaused.value = false
  }
})
</script>

<style lang="scss" scoped>
.undo-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  /* 确保层级高于一般内容，但低于模态框(如果有) */
  z-index: 900;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  min-width: 300px;
  max-width: 400px;
  padding: 12px 16px;

  background-color: var(--text-primary); /* 深色背景 (在亮色模式下是深灰) */
  color: var(--bg-card); /* 反色文字 */
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden; /* 为了包含进度条 */
}

/* 深色模式适配: Toast 应该反色以突出显示 */
html.dark .undo-toast {
  background-color: #F3F4F6; /* 接近白色 */
  color: #111827; /* 接近黑色 */
}

.toast-message {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.undo-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: var(--color-brand);
  color: white;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--color-brand-hover);
  }
}

.close-btn {
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.1);
  }
}
html.dark .close-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.icon-sm {
  width: 16px;
  height: 16px;
}

/* 进度条样式 */
.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background-color: var(--color-brand);
  /* 初始宽度 100% */
  width: 100%;
  /* 线性动画从 100% 到 0% */
  animation-name: progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

.progress-bar.paused {
  animation-play-state: paused;
}

@keyframes progress {
  from { width: 100%; }
  to { width: 0%; }
}

/* 进出场动画 */
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>