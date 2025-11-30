import { createRouter, createWebHashHistory } from 'vue-router'
import { h } from 'vue'

// 路由组件懒加载
const StreamTimeline = () => import('@/components/timeline/StreamTimeline.vue')
const TagsView = () => import('@/views/TagsView.vue')
// [新增] 引入新的 SettingsView
const SettingsView = () => import('@/views/SettingsView.vue')

const router = createRouter({
    // Electron 环境下推荐使用 Hash 模式
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: StreamTimeline,
            meta: { title: 'Today' }
        },
        {
            path: '/tags',
            name: 'tags',
            component: TagsView,
            meta: { title: 'Tags' }
        },
        {
            path: '/settings',
            name: 'settings',
            // [修改] 指向真实的 SettingsView 组件
            component: SettingsView,
            meta: { title: 'Settings' }
        }
    ]
})

export default router