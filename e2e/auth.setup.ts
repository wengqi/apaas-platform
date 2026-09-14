/**
 * Auth setup — 通过 UI 登录获取 JWT token，保存 storageState 供后续测试复用。
 *
 * Locator 说明（2026-09-13 修复）：登录页邮箱输入框 placeholder 为 name@example.com、
 * 按钮文本为「登 录」（中间含空格），旧实现的 getByPlaceholder('邮箱') / name:'登录'
 * 永远无法匹配。改用可访问名称（Form.Item label 生成的 role+name）定位。
 */

import { test as setup, expect } from '@playwright/test';
import { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './fixtures.js';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('登录超管账号', async ({ page }) => {
  await page.goto('/t/demo/login');

  // 表单字段以可访问名称定位（label: 租户标识 / 邮箱 / 密码）
  await page.getByRole('textbox', { name: '邮箱' }).fill(SUPERADMIN_EMAIL);
  await page.getByRole('textbox', { name: '密码' }).fill(SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: '登 录' }).click();

  await page.waitForURL('**/apps', { timeout: 20_000 });
  await expect(page).toHaveURL(/\/apps$/);

  await page.context().storageState({ path: AUTH_FILE });
});
