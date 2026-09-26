import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置。
 *
 * 测试策略：真实端到端（启动 PostgreSQL + Redis + Gateway + Studio）。
 * webServer 自动启动 dev server 并等待健康检查通过。
 * 本地开发时 reuseExistingServer=true，复用已运行的服务。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
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

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: !process.env.CI,
    // CI 2 核 runner 上全栈冷启动较慢，预留更长健康检查窗口
    timeout: 180_000,
  },
});
