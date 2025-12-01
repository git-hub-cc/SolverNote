import { createRouter, createWebHashHistory } from 'vue-router'

// 懒加载组件
const SingleNoteView = () => import('@/views/SingleNoteView.vue')
const StreamTimeline = () => import('@/components/timeline/StreamTimeline.vue')
const TagsView = () => import('@/views/TagsView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')

const router = createRouter({
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
            component: SettingsView,
            meta: { title: 'Settings' }
        },
        {
            // [关键修改] 支持嵌套路径作为 ID
            // 正则 (.*)+ 允许 noteId 包含斜杠
            // 例如：/notes/folder/subfolder/my-note.md
            path: '/notes/:noteId(.*)+',
            name: 'note-view',
            component: SingleNoteView,
            props: true,
            meta: { title: 'Note' }
        }
    ]
})

export default router