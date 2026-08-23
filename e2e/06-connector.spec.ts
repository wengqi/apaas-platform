/**
 * E2E 测试 — 连接器与集成 (Phase 5 验收)。
 *
 * 覆盖场景：创建 HTTP 连接器 → 调用测试 → 验证返回数据
 * 验收标准（ROADMAP）：创建HTTP连接器→在流程中调用→验证返回数据
 *
 * 设计决策：使用 jsonplaceholder.typicode.com 作为外部 HTTP 目标（可靠、免认证）。
 * 连接器 test/invoke API 是流程节点 http_request executor 调用的核心路径
 * （复用同一 ConnectorCallService.invoke），因此直接测试 API 层。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('连接器与集成', () => {
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

  test('创建 HTTP 连接器并调用测试', async () => {
    // 创建 HTTP 连接器
    const connector = await api.post<{ id: string }>('/apps/' + appId + '/connectors', {
      apiName: 'e2e_http_conn',
      name: 'E2E HTTP 连接器',
      type: 'HTTP',
      baseUrl: 'https://jsonplaceholder.typicode.com',
    });
    expect(connector.id).toBeTruthy();

    // 调用测试 — GET /posts/1
    const testResult = await api.post<{
      statusCode: number;
      responseBody: unknown;
      success: boolean;
    }>(`/connectors/${connector.id}/test`, {
      method: 'GET',
      path: '/posts/1',
    });

    expect(testResult.success).toBe(true);
    expect(testResult.statusCode).toBe(200);
    const body = testResult.responseBody as Record<string, unknown>;
    expect(body.id).toBe(1);
    expect(body.userId).toBeTruthy();
  });

  test('调用连接器 invoke 获取多条数据', async () => {
    const connector = await api.post<{ id: string }>('/apps/' + appId + '/connectors', {
      apiName: 'e2e_http_invoke',
      name: 'E2E Invoke 连接器',
      type: 'HTTP',
      baseUrl: 'https://jsonplaceholder.typicode.com',
    });

    // invoke — GET /posts（返回数组）
    const invokeResult = await api.post<{
      statusCode: number;
      responseBody: unknown;
      success: boolean;
    }>(`/connectors/${connector.id}/invoke`, {
      method: 'GET',
      path: '/posts',
    });

    expect(invokeResult.success).toBe(true);
    expect(Array.isArray(invokeResult.responseBody)).toBe(true);
    expect((invokeResult.responseBody as unknown[]).length).toBeGreaterThan(0);
  });

  test('连接器列表查询', async () => {
    await api.post('/apps/' + appId + '/connectors', {
      apiName: 'e2e_conn_list',
      name: '列表测试连接器',
      type: 'HTTP',
      baseUrl: 'https://jsonplaceholder.typicode.com',
    });

    const list = await api.get<Array<{ id: string; name: string }>>(
      '/apps/' + appId + '/connectors',
    );
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((c) => c.name === '列表测试连接器')).toBe(true);
  });

  test('UI 中查看连接器列表', async ({ page }) => {
    await page.goto(`/app/${appId}/connectors`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/connectors$/);
  });
});
