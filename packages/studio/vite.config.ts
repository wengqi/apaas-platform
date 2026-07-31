import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // 确保 @flowgram.ai/* 只加载一份实例(pnpm 隔离模式下可能出现多副本)
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: Number(process.env.VITE_STUDIO_PORT) || 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
});
