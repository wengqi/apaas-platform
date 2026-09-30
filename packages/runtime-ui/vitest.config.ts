import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const stubAmis = fileURLToPath(new URL('./test/stubs/amis-stub.ts', import.meta.url));
const stubEmpty = fileURLToPath(new URL('./test/stubs/amis-empty.ts', import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
  // amis 运行时（monaco/DOM 重依赖）在纯函数单测中不需要真实加载：
  // 只 stub 包入口与副作用 import，纯函数（adaptApiResponse/pageContainsForm）正常测试
  resolve: {
    alias: [
      { find: /^amis$/, replacement: stubAmis },
      { find: /^amis-core$/, replacement: stubEmpty },
      { find: /^amis-ui\/lib\/themes\/antd$/, replacement: stubEmpty },
      { find: /^amis-ui\/lib\/locale\/zh-CN$/, replacement: stubEmpty },
    ],
  },
});
