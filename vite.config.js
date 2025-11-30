import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    // 关键：Electron 文件系统加载必须用相对路径
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    // CSS 预处理器配置，用于消除 Sass 废弃警告
    css: {
        preprocessorOptions: {
            scss: {
                // 屏蔽 @import 和 legacy-js-api 的废弃警告
                silenceDeprecations: ['legacy-js-api', 'import'],
                // 注意：如果你的 sass 版本非常新，有时可能需要指定 api: 'modern'
                // 但通常只需 silenceDeprecations 即可
            }
        }
    },
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    }
})