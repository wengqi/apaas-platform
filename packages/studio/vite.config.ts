import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@flowgram.ai/fixed-semi-materials', '@douyinfe/semi-ui', '@douyinfe/semi-icons'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // i18n-runtime（amis-editor 传递依赖）发布的 package.json 声明 module=es/index.js
      // 但包内只有 lib/ —— 别名指到真实存在的 CJS 构建
      'i18n-runtime': 'i18n-runtime/lib/index.js',
    },
    // 确保 @flowgram.ai/* 只加载一份实例(pnpm 隔离模式下可能出现多副本)
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: Number(process.env.VITE_STUDIO_PORT) || 5173,
    proxy: {
      // /api/v1/ 和 /api/docs 直接透传（Swagger + 已含版本号的请求）
      '/api/v1': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/docs': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      // /api/xxx 重写为 /api/v1/xxx（后端 URI 版本控制）
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/(?!v1|docs)/, '/api/v1/'),
      },
    },
  },
  preview: {
    // e2e/人工验收消费预构建产物；index.html 禁缓存（hash 资源可长缓存），
    // 防止重新构建后浏览器仍持有旧 index.html → 加载旧 JS bundle
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api/v1': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/docs': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/(?!v1|docs)/, '/api/v1/'),
      },
    },
  },
});
