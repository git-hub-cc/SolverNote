import { createRouter, createWebHashHistory } from 'vue-router'

// [核心修改] 引入新建的 SingleNoteView 视图组件
const SingleNoteView = () => import('@/views/SingleNoteView.vue')

// 其他组件懒加载保持不变
const StreamTimeline = () => import('@/components/timeline/StreamTimeline.vue')
const TagsView = () => import('@/views/TagsView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')

const router = createRouter({
    // Electron 环境下推荐使用 Hash 模式，因为它不依赖服务器配置
    history: createWebHashHistory(),
    routes: [
        {
            // 主页，显示时间线
            path: '/',
            name: 'home',
            component: StreamTimeline,
            meta: { title: 'Today' }
        },
        {
            // 标签聚合页
            path: '/tags',
            name: 'tags',
            component: TagsView,
            meta: { title: 'Tags' }
        },
        {
            // 设置页
            path: '/settings',
            name: 'settings',
            component: SettingsView,
            meta: { title: 'Settings' }
        },
        {
            // [核心新增] 单个笔记的展示路由
            // 使用动态路由参数 `:noteId` 来捕获笔记的文件名
            path: '/notes/:noteId',
            name: 'note-view', // 命名路由，方便在 <router-link> 中使用
            component: SingleNoteView,

            // `props: true` 是一个非常方便的配置，
            // 它会自动将路由参数 (如 noteId) 作为 prop 传递给 SingleNoteView 组件。
            // 这样在组件内部就可以直接通过 `props.noteId` 来访问，无需手动从 `$route.params` 获取，
            // 使得组件与路由的耦合度降低，更易于测试和复用。
            props: true,

            meta: { title: 'Note' } // 标题可以后续通过导航守卫动态设置，此处为简化设为静态
        }
    ]
})

export default router