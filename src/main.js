import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// [核心修改] 移除静态导入的 highlight.js 主题文件
// 主题将由 App.vue 根据当前亮/暗模式动态加载
// import 'highlight.js/styles/atom-one-dark.css'

// 引入全局样式 (Sass)
import './assets/styles/main.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')