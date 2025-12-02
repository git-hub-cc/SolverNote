<template>
  <transition name="notify-slide">
    <div
        v-if="visible"
        class="notification-toast"
        :class="typeClass"
        @mouseenter="pauseTimer"
        @mouseleave="resumeTimer"
        @click="close"
    >
      <!-- 图标区域 -->
      <div class="notify-icon-wrapper">
        <component :is="iconComponent" class="notify-icon" />
      </div>

      <!-- 内容区域 -->
      <div class="notify-content">
        <span class="notify-message">{{ message }}</span>
      </div>

      <!-- 关闭按钮 (可选，鼠标悬停时更明显) -->
      <button class="notify-close" title="Close">
        <XIcon class="icon-xs" />
      </button>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue'
import { useUIStore } from '@/stores/uiStore'
import {
  Info as InfoIcon,
  CheckCircle2 as CheckIcon,
  AlertCircle as ErrorIcon,
  AlertTriangle as WarningIcon,
  X as XIcon
} from 'lucide-vue-next'

const uiStore = useUIStore()

// --- 状态获取 ---
const visible = computed(() => uiStore.notificationState.visible)
const message = computed(() => uiStore.notificationState.message)
const type = computed(() => uiStore.notificationState.type)
const duration = computed(() => uiStore.notificationState.duration)

// --- 样式逻辑 ---
const typeClass = computed(() => `is-${type.value}`)

const iconComponent = computed(() => {
  switch (type.value) {
    case 'success': return CheckIcon
    case 'error': return ErrorIcon
    case 'warning': return WarningIcon
    case 'info':
    default: return InfoIcon
  }
})

// --- 交互逻辑 ---
const close = () => {
  uiStore.hideNotification()
}

// 鼠标悬停时暂停自动关闭 (鲁棒性体验)
// 这里我们简单地通过 Store 重新设置定时器来实现，或者保持简单不暂停。
// 为了保持代码极简且不侵入 Store 太多逻辑，这里暂时只提供视觉反馈，
// 真正的定时器暂停逻辑如果需要非常精确，需要在 Store 中增加 pause/resume action。
// 考虑到这是轻量级通知，点击即关闭通常足够。
const pauseTimer = () => {
  // 预留接口
}
const resumeTimer = () => {
  // 预留接口
}
</script>

<style lang="scss" scoped>
.notification-toast {
  position: fixed;
  top: 24px;
  /* 居中显示，或者改为 right: 24px 放右上角 */
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000; /* 高于大部分元素，但低于模态框(如果有) */

  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 280px;
  max-width: 450px;
  padding: 10px 16px;

  border-radius: 50px; /* 全圆角设计，现代感强 */
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  user-select: none;

  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  transition: all 0.2s ease;

  /* 类型样式 */
  &.is-info { border-left: 4px solid var(--color-brand); }
  &.is-success { border-left: 4px solid #10B981; }
  &.is-error { border-left: 4px solid #EF4444; }
  &.is-warning { border-left: 4px solid #F59E0B; }

  &:hover {
    transform: translateX(-50%) translateY(2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
}

.notify-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.notify-icon {
  width: 18px;
  height: 18px;
}
.is-info .notify-icon { color: var(--color-brand); }
.is-success .notify-icon { color: #10B981; }
.is-error .notify-icon { color: #EF4444; }
.is-warning .notify-icon { color: #F59E0B; }

.notify-content {
  flex: 1;
  display: flex;
  align-items: center;
}

.notify-message {
  line-height: 1.4;
}

.notify-close {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  padding: 4px;
  border-radius: 50%;
  background: transparent;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }
}

.icon-xs {
  width: 14px;
  height: 14px;
}

/* 动画效果 */
.notify-slide-enter-active,
.notify-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.notify-slide-enter-from,
.notify-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>