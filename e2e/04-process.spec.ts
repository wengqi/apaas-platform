/**
 * E2E 测试 — 流程引擎。
 *
 * 覆盖场景：创建流程定义 → 发布 → 启动实例 → 验证状态
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('流程引擎', () => {
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

  test('创建流程定义并发布', async () => {
    const process = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: 'test_process',
      name: '测试流程',
      triggerType: 'MANUAL',
      workflowSchema: {
        nodes: [
          { id: 'start', type: 'start', data: {}, position: { x: 100, y: 100 } },
          { id: 'end', type: 'end', data: {}, position: { x: 400, y: 100 } },
        ],
        edges: [{ sourceNodeID: 'start', targetNodeID: 'end' }],
      },
    });
    expect(process.id).toBeTruthy();

    // 发布流程
    const published = await api.post(`/processes/${process.id}/publish`);
    expect(published).toBeTruthy();

    // 验证状态已变更
    const detail = await api.get<{ status: string }>(`/processes/${process.id}`);
    expect(detail.status).toBe('PUBLISHED');
  });

  test('启动流程实例', async () => {
    const process = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: 'test_instance_process',
      name: '测试实例流程',
      triggerType: 'MANUAL',
      workflowSchema: {
        nodes: [
          { id: 'start', type: 'start', data: {}, position: { x: 100, y: 100 } },
          { id: 'end', type: 'end', data: {}, position: { x: 400, y: 100 } },
        ],
        edges: [{ sourceNodeID: 'start', targetNodeID: 'end' }],
      },
    });

    await api.post(`/processes/${process.id}/publish`);

    // 启动实例
    const instance = await api.post<{ id: string; status?: string }>(
      `/processes/${process.id}/start`,
      {},
    );
    expect(instance.id).toBeTruthy();
  });

  test('UI 中查看流程列表', async ({ page }) => {
    await page.goto(`/app/${appId}/processes`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/processes$/);
  });
});
