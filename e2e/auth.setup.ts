/**
 * Auth setup — 生成 storageState 供后续测试复用。
 *
 * 实现（2026-10-06 改版）：API 登录后直写 localStorage 的 zustand persist 键
 * （apaas:auth）。此前的 UI 表单登录在 e2e 连续运行时会撞 auth 端点限流
 * （10/min 滚动窗口）导致间歇性 setup 失败；登录 UI 本身已有 e2e/01 覆盖，
 * setup 只需高效产出可信 storageState。
 */

import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = 'e2e/.auth/user.json';
const API_BASE = 'http://localhost:3000/api/v1';
const STUDIO_ORIGIN = 'http://localhost:5173';

setup('登录超管账号', async ({ request }) => {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'admin@apaas.dev', password: 'admin123', tenantSlug: 'demo' },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
  const { accessToken: token, user } = json.data;
  expect(token).toBeTruthy();

  // zustand persist（key=apaas:auth）结构：{state:{token,user},version}
  const storage = {
    cookies: [] as unknown[],
    origins: [
      {
        origin: STUDIO_ORIGIN,
        localStorage: [
          {
            name: 'apaas:auth',
            value: JSON.stringify({ state: { token, user }, version: 0 }),
          },
        ],
      },
    ],
  };
  // 写入 storageState 文件（供 chromium project 复用）
  const fs = await import('node:fs');
  fs.mkdirSync('e2e/.auth', { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(storage));
});
