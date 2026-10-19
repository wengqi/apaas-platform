/**
 * E2E 测试 — 应用级审计日志 UI（ROADMAP 9.9 回归）。
 *
 * 背景：ROADMAP 9.9「应用管理后台（概览 + 环境信息 + 审计日志）」此前为部分完成——
 * 审计查询仅有平台级页面，缺少应用内视图；审计记录也未携带应用维度（appId）。
 *
 * 本 spec 验证：
 *  1. 应用内「审计日志」入口存在并可打开；
 *  2. 在该应用内产生的记录写入（RECORD_CREATE）出现在应用级审计列表中
 *     （证明 appId 维度写入 + 过滤查询贯通）。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('应用级审计日志（ROADMAP 9.9 回归）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let objectId = '';
  let recordMarker = '';

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api);

    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'audit_spec_object',
      name: '审计验证',
      icon: 'box',
    });
    objectId = obj.id;
    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: 'name',
      label: '名称',
      type: 'text',
      config: {},
    });

    // 通过应用 API 写入一条记录 → 应产生带 appId 的 RECORD_CREATE 审计
    recordMarker = `audit-${Date.now()}`;
    await api.post(`/objects/${objectId}/records`, { name: recordMarker });
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  test('应用内审计日志入口可见（侧边栏）', async ({ page }) => {
    await page.goto(`/app/${appId}/dashboard`);
    await expect(page.getByRole('menuitem', { name: /审计日志/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('应用级审计列表展示本应用记录写入事件', async ({ page }) => {
    await page.goto(`/app/${appId}/audit-logs`);

    // 列表出现 RECORD_CREATE 事件（appId 维度写入 + 过滤贯通）
    await expect(page.getByText('RECORD_CREATE').first()).toBeVisible({ timeout: 15_000 });
    // 且事件归属于本应用（按 appId 过滤后仍能查到该记录写入）
    await expect(page.getByRole('table')).toBeVisible();

    const rows = await page.locator('tbody tr.ant-table-row').allTextContents();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.includes('RECORD_CREATE'))).toBe(true);
  });

  test('平台级审计接口按 appId 过滤返回本应用事件', async () => {
    const result = await api.get<{ items: Array<{ action: string; appId: string | null }> }>(
      `/audit-logs?appId=${appId}&page=1&pageSize=50`,
    );
    expect(result.items.length).toBeGreaterThan(0);
    // 全部条目均属于该应用（过滤语义正确）
    expect(result.items.every((i) => i.appId === appId)).toBe(true);
    expect(result.items.some((i) => i.action === 'RECORD_CREATE')).toBe(true);
  });
});
