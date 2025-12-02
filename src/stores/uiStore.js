// src/stores/uiStore.js

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
    // --- 状态 (State) ---

    // [核心修改] 默认主题从 'system' 改为 'light'。
    // 我们不再需要追踪系统主题，应用主题现在完全由用户选择决定。
    const themePreference = ref('light')

    /**
     * [原有] 撤销提示框 (Undo Toast) 的状态
     * 专用于 "软删除 + 撤销" 场景
     */
    const toastState = ref({
        visible: false,
        message: '',
        actionLabel: 'Undo',
        actionPayload: null,
        duration: 5000,
        timerId: null
    })

    /**
     * [新增] 通用通知 (Notification) 的状态
     * 用于替代 alert()，显示成功、错误、警告等信息
     * 类型: 'success' | 'error' | 'info' | 'warning'
     */
    const notificationState = ref({
        visible: false,
        message: '',
        type: 'info',
        duration: 3000,
        timerId: null
    })

    // --- 计算属性 (Getters) ---

    // [核心修改] 简化 effectiveTheme 的计算逻辑。
    // 由于没有了 'system' 选项，有效主题就是用户偏好的主题。
    const effectiveTheme = computed(() => themePreference.value)

    // --- 操作 (Actions): 主题相关 ---

    /**
     * 设置应用的主题偏好。
     * @param {'light' | 'dark'} preference - 用户选择的主题。
     */
    function setThemePreference(preference) {
        // 鲁棒性检查：确保传入的是有效的主题值。
        if (['light', 'dark'].includes(preference)) {
            themePreference.value = preference
            localStorage.setItem('theme-preference', preference)

            // [核心修改] 直接通知主进程更新原生主题，不再需要 'system' 这个中间状态。
            // 这样做简化了逻辑，使得渲染进程成为主题的唯一“事实来源”。
            if (window.electronAPI && window.electronAPI.setNativeTheme) {
                window.electronAPI.setNativeTheme(preference)
            }
        }
    }

    /**
     * 初始化主题。
     * 在应用启动时调用，从本地存储加载用户偏好。
     */
    async function initializeTheme() {
        const savedPreference = localStorage.getItem('theme-preference')
        // 确保加载的值是有效的，如果不是，则回退到默认的 'light'。
        if (savedPreference === 'light' || savedPreference === 'dark') {
            // 使用 setThemePreference 来应用主题，因为它包含了通知主进程的逻辑。
            setThemePreference(savedPreference)
        } else {
            setThemePreference('light') // 应用默认主题
        }
        // [核心修改] 移除了所有与监听系统主题变化相关的 Electron API 调用，因为不再需要。
    }

    // --- 操作 (Actions): 撤销 Toast (Undo Toast) ---

    function showUndoToast(message, payload, duration = 5000) {
        if (toastState.value.timerId) {
            clearTimeout(toastState.value.timerId)
        }
        toastState.value = {
            visible: true,
            message,
            actionLabel: 'Undo',
            actionPayload: payload,
            duration,
            timerId: null
        }
    }

    function hideToast() {
        toastState.value.visible = false
        setTimeout(() => {
            if (!toastState.value.visible) {
                toastState.value.actionPayload = null
            }
        }, 300)
    }

    // --- 操作 (Actions): 通用通知 ---

    /**
     * 显示通用通知
     * @param {string} message - 通知内容
     * @param {'info' | 'success' | 'error' | 'warning'} type - 通知类型
     * @param {number} duration - 自动关闭时间 (毫秒)
     */
    function showNotification(message, type = 'info', duration = 3000) {
        if (notificationState.value.timerId) {
            clearTimeout(notificationState.value.timerId)
        }
        notificationState.value = {
            visible: true,
            message,
            type,
            duration,
            timerId: setTimeout(() => {
                hideNotification()
            }, duration)
        }
    }

    /**
     * 隐藏通用通知
     */
    function hideNotification() {
        notificationState.value.visible = false
        if (notificationState.value.timerId) {
            clearTimeout(notificationState.value.timerId)
            notificationState.value.timerId = null
        }
    }

    /**
     * 清理函数，在组件卸载时调用。
     */
    function cleanup() {
        // [核心修改] 由于移除了主题监听器，这里不再需要执行任何清理操作。
        // 保留函数结构以备将来扩展。
    }

    // 导出 state 和 actions
    return {
        themePreference,
        effectiveTheme,
        toastState,
        notificationState,
        setThemePreference,
        initializeTheme,
        showUndoToast,
        hideToast,
        showNotification,
        hideNotification,
        cleanup
    }
})