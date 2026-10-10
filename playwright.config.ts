import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置。
 *
 * 测试策略：真实端到端（启动 PostgreSQL + Redis + Gateway + Studio + Runtime-UI）。
 * webServer 仅启动 e2e 需要的服务，且都消费预构建产物，避免 dev 模式
 * 的冷编译/按需优化窗口导致偶发超时（CI 2 核 runner 上尤其明显）：
 *   - Gateway：node dist/main.js；CI e2e job 需先 `pnpm --filter @apaas/gateway run build`
 *   - Studio：vite preview 服务 build 产物（preview.proxy 继承 server.proxy）；
 *     CI e2e job 需先 `pnpm --filter @apaas/studio run build`
 *   - Runtime-UI：vite preview 服务 build 产物（5174，审批页 DOM 级数据可见性验收）；
 *     CI e2e job 需先 `pnpm --filter @apaas/runtime-ui run build`
 * 本地开发时 reuseExistingServer=true，复用已运行的服务（如 Docker 部署的 Gateway）。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: 'node apps/gateway/dist/main.js',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // 限流阈值与 ci.yml e2e job 注入同款（e2e 高频轮询/清场在 10/min auth 桶下必 429）。
      // 本地常驻 gateway 若以 apps/gateway 为 cwd 启动，读不到根 .env 的 THROTTLE_*，
      // Playwright 自启时在此显式注入；复用常驻进程的场景需在 apps/gateway/.env 补齐并重启。
      env: { THROTTLE_AUTH_LIMIT: '10000', THROTTLE_DEFAULT_LIMIT: '10000' },
    },
    {
      command: 'pnpm --filter @apaas/studio exec vite preview --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @apaas/runtime-ui exec vite preview --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
