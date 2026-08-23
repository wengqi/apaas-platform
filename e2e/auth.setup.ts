/**
 * Auth setup — 通过 UI 登录获取 JWT token，保存 storageState 供后续测试复用。
 */

import { test as setup, expect } from '@playwright/test';
import { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './fixtures.js';

const AUTH_FILE = 'e2e/.auth/user.json';

setup('登录超管账号', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('邮箱').fill(SUPERADMIN_EMAIL);
  await page.getByPlaceholder('密码').fill(SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();

  await page.waitForURL('**/apps', { timeout: 15_000 });
  await expect(page).toHaveURL(/\/apps$/);

  await page.context().storageState({ path: AUTH_FILE });
});
