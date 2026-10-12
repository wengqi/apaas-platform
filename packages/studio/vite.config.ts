import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Semi UI 包根定位：经 node 解析器从本包出发找 semi-ui 主入口（lib/cjs/index.js），
// 再回推包根——不假设 pnpm 提升布局（CI 的 .pnpm store 与本地
// packages/studio/node_modules 布局不同，写死相对路径会在 CI ENOENT）。
const studioRequire = createRequire(import.meta.url);
const semiPkgRoot = join(dirname(studioRequire.resolve('@douyinfe/semi-ui')), '..', '..');

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
      // Semi UI 完整样式包（流程画布 flowgram fixed-semi-materials 依赖，SimplifiedEditor
      // 导入）：semi-ui 的 exports map 只暴露组件级 css 通配（./lib/es/*.css），完整包
      // dist/css/semi.min.css 不在表内，deep import 会被 "Missing specifier" 拦截——
      // 这正是此前 index.html 用 /node_modules 直链的根因（该写法生产构建 404，已删）。
      // alias 直指物理文件绕过 exports；物理路径经上方解析器定位（跨布局稳定）。
      '@douyinfe/semi-ui/dist/css/semi.min.css': join(semiPkgRoot, 'dist/css/semi.min.css'),
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
