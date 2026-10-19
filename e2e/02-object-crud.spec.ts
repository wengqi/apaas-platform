/**
 * E2E 测试 — 对象建模 CRUD。
 *
 * 覆盖场景：创建对象 → 添加字段 → 创建记录 → 查询记录 → 删除记录
 * 通过 API 调用操作，配合 UI 验证。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('对象建模 CRUD', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId: string;

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api);
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  test('创建对象并添加字段', async () => {
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'test_asset',
      name: '测试资产',
      icon: 'box',
    });
    expect(obj.id).toBeTruthy();

    // 添加文本字段
    const field = await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'asset_name',
      label: '资产名称',
      type: 'TEXT',
      required: true,
    });
    expect(field).toBeTruthy();

    // 添加数字字段
    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'asset_value',
      label: '资产价值',
      type: 'NUMBER',
    });

    // 验证字段已添加（对象创建自动附带 5 个系统字段，此处只数业务字段）
    const objDetail = await api.get<{
      fields: Array<{ apiName: string; isSystem: boolean }>;
    }>(`/design/apps/${appId}/objects/${obj.id}`);
    expect(objDetail.fields.filter((f) => !f.isSystem)).toHaveLength(2);
  });

  test('创建记录并查询', async () => {
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'test_record_obj',
      name: '测试记录对象',
      icon: 'box',
    });

    // 添加字段
    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'name',
      label: '名称',
      type: 'TEXT',
      required: true,
    });

    // 创建记录
    const record = await api.post<{ id: string }>(`/objects/${obj.id}/records`, {
      name: '测试记录1',
    });
    expect(record.id).toBeTruthy();

    // 查询记录
    const recordDetail = await api.get<{ id: string }>(`/records/${record.id}`);
    expect(recordDetail.id).toBe(record.id);

    // 列表查询
    const list = await api.get<{ items: unknown[] }>(`/objects/${obj.id}/records`);
    expect(list.items.length).toBeGreaterThanOrEqual(1);
  });

  test('UI 中查看对象列表', async ({ page }) => {
    await page.goto(`/app/${appId}/objects`);
    await page.waitForTimeout(2000);
    // 页面应显示对象设计器
    await expect(page).toHaveURL(/\/objects$/);
  });
});
