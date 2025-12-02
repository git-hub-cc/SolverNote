// src/stores/uiStore.js

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
    // --- State ---

    const themePreference = ref('system')
    const systemTheme = ref('light')
    let unsubscribeThemeListener = null

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

    // --- Getters ---

    const effectiveTheme = computed(() => {
        if (themePreference.value === 'system') {
            return systemTheme.value
        }
        return themePreference.value
    })

    // --- Actions: Theme ---

    function setThemePreference(preference) {
        if (['system', 'light', 'dark'].includes(preference)) {
            themePreference.value = preference
            localStorage.setItem('theme-preference', preference)
        }
    }

    async function initializeTheme() {
        const savedPreference = localStorage.getItem('theme-preference')
        if (savedPreference) {
            setThemePreference(savedPreference)
        }

        if (window.electronAPI) {
            const initialSystemTheme = await window.electronAPI.getSystemTheme()
            systemTheme.value = initialSystemTheme

            if (unsubscribeThemeListener) unsubscribeThemeListener()
            unsubscribeThemeListener = window.electronAPI.onThemeUpdate((newTheme) => {
                systemTheme.value = newTheme
            })
        }
    }

    // --- Actions: Undo Toast (Existing) ---

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

    // --- Actions: General Notification (New) ---

    /**
     * [新增] 显示通用通知
     * @param {string} message - 通知内容
     * @param {string} type - 'info', 'success', 'error', 'warning'
     * @param {number} duration - 自动关闭时间 (ms)
     */
    function showNotification(message, type = 'info', duration = 3000) {
        // 清除上一个通知的定时器，防止冲突
        if (notificationState.value.timerId) {
            clearTimeout(notificationState.value.timerId)
        }

        // 设置新状态
        notificationState.value = {
            visible: true,
            message,
            type,
            duration,
            // 启动自动关闭定时器
            timerId: setTimeout(() => {
                hideNotification()
            }, duration)
        }
    }

    /**
     * [新增] 隐藏通用通知
     */
    function hideNotification() {
        notificationState.value.visible = false
        // 清理定时器引用
        if (notificationState.value.timerId) {
            clearTimeout(notificationState.value.timerId)
            notificationState.value.timerId = null
        }
    }

    function cleanup() {
        if (unsubscribeThemeListener) {
            unsubscribeThemeListener()
        }
    }

    return {
        themePreference,
        effectiveTheme,
        // Toast State (Undo)
        toastState,
        // Notification State (General)
        notificationState,
        setThemePreference,
        initializeTheme,
        // Actions
        showUndoToast,
        hideToast,
        showNotification, // 导出新 action
        hideNotification, // 导出新 action
        cleanup
    }
})