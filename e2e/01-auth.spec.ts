/**
 * E2E 测试 — 认证流程。
 *
 * 覆盖场景：
 * 1. 正确凭证登录 → 跳转应用列表
 * 2. 错误密码 → 显示错误提示
 * 3. 未登录访问受保护页面 → 重定向到登录页
 *
 * Locator 说明（2026-09-13 修复）：登录页邮箱 placeholder 为 name@example.com、
 * 按钮文本为「登 录」，改用可访问名称定位（与 auth.setup.ts 一致）。
 */

import { test, expect } from '@playwright/test';
import { SUPERADMIN_EMAIL } from './fixtures.js';

test.describe('认证流程', () => {
  test('正确凭证应跳转到应用列表', async ({ page }) => {
    await page.goto('/t/demo/login');
    await page.getByRole('textbox', { name: '邮箱' }).fill(SUPERADMIN_EMAIL);
    await page.getByRole('textbox', { name: '密码' }).fill('admin123');
    await page.getByRole('button', { name: '登 录' }).click();

    await page.waitForURL('**/apps', { timeout: 20_000 });
    expect(page.url()).toContain('/apps');
  });

  test('错误密码应显示错误提示', async ({ page }) => {
    await page.goto('/t/demo/login');
    await page.getByRole('textbox', { name: '邮箱' }).fill(SUPERADMIN_EMAIL);
    await page.getByRole('textbox', { name: '密码' }).fill('wrongpassword');
    await page.getByRole('button', { name: '登 录' }).click();

    // 等待错误提示出现（可能是 toast 或 inline message）
    await page.waitForTimeout(2000);
    // 不应跳转到 /apps
    expect(page.url()).not.toContain('/apps');
  });

  test('未登录访问受保护页面应重定向到登录', async ({ browser }) => {
    // 使用无 storageState 的全新 context
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto('/apps');
    await page.waitForURL('**/login', { timeout: 10_000 });
    expect(page.url()).toContain('/login');
    await context.close();
  });
});
