// src/stores/uiStore.js

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
    // --- State ---

    /**
     * @type {import('vue').Ref<'system' | 'light' | 'dark'>}
     * 用户的偏好设置。'system' 表示跟随操作系统。
     * 这是我们需要持久化（保存）的状态。
     */
    const themePreference = ref('system')

    /**
     * @type {import('vue').Ref<'light' | 'dark'>}
     * 从 Electron 主进程获取到的当前操作系统的主题。
     */
    const systemTheme = ref('light')

    /**
     * @type {Function | null}
     * 用于取消 Electron 主题更新事件监听的函数。
     */
    let unsubscribeThemeListener = null

    // --- Getters ---

    /**
     * 计算出最终应该应用的主题。
     * 这是整个应用中唯一需要关心的主题状态。
     * @returns {'light' | 'dark'}
     */
    const effectiveTheme = computed(() => {
        if (themePreference.value === 'system') {
            return systemTheme.value
        }
        return themePreference.value
    })

    // --- Actions ---

    /**
     * 设置用户的主题偏好，并将其保存到 localStorage。
     * @param {'system' | 'light' | 'dark'} preference
     */
    function setThemePreference(preference) {
        if (['system', 'light', 'dark'].includes(preference)) {
            themePreference.value = preference
            localStorage.setItem('theme-preference', preference)
        }
    }

    /**
     * 初始化主题逻辑。
     * 这个函数应该在应用启动时（在 App.vue 中）调用一次。
     * 它会：
     * 1. 从 localStorage 加载用户之前的设置。
     * 2. 获取并应用当前的系统主题。
     * 3. 设置一个监听器，以便在系统主题变化时自动更新。
     */
    async function initializeTheme() {
        // 1. 从 localStorage 加载偏好
        const savedPreference = localStorage.getItem('theme-preference')
        if (savedPreference) {
            setThemePreference(savedPreference)
        }

        // 2. 如果 Electron API 可用，则与主进程同步
        if (window.electronAPI) {
            // 获取初始系统主题
            const initialSystemTheme = await window.electronAPI.getSystemTheme()
            systemTheme.value = initialSystemTheme

            // 3. 监听系统主题的后续变化
            if (unsubscribeThemeListener) {
                unsubscribeThemeListener() // 清理旧的监听器
            }
            unsubscribeThemeListener = window.electronAPI.onThemeUpdate((newTheme) => {
                systemTheme.value = newTheme
            })
        }
    }

    /**
     * 在应用卸载时清理监听器，防止内存泄漏。
     */
    function cleanup() {
        if (unsubscribeThemeListener) {
            unsubscribeThemeListener()
        }
    }

    return {
        themePreference,
        effectiveTheme,
        setThemePreference,
        initializeTheme,
        cleanup
    }
})