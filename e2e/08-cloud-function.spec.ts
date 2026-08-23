/**
 * E2E 测试 — 云函数 (Phase 8.4 验收)。
 *
 * 覆盖场景：创建云函数 → 发布 → 调用 → 验证返回
 * 验收标准（ROADMAP）：创建云函数→在流程中调用→验证返回
 *
 * 设计决策：直接测试 invoke API（isolated-vm 沙箱执行）。
 * cloud_function executor 复用同一 CloudFunctionService.invoke，
 * 因此 API 层测试覆盖核心执行路径。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('云函数', () => {
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

  test('创建 + 发布 + 调用云函数', async () => {
    // 创建云函数 — 输入值翻倍
    const fn = await api.post<{ id: string; status: string }>(
      '/apps/' + appId + '/cloud-functions',
      {
        apiName: 'e2e_double',
        name: 'E2E 翻倍函数',
        description: '将输入值翻倍返回',
        code: {
          source: 'async function handler(input) { return { doubled: input.value * 2 }; }',
          language: 'javascript',
        },
        inputSchema: [{ name: 'value', type: 'number', required: true, description: '输入数值' }],
      },
    );
    expect(fn.id).toBeTruthy();
    expect(fn.status).toBe('DRAFT');

    // 发布
    const published = await api.post<{ id: string; status: string; version: number }>(
      `/cloud-functions/${fn.id}/publish`,
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.version).toBeGreaterThanOrEqual(1);

    // 调用
    const result = await api.post<{
      success: boolean;
      result: unknown;
      logs: string[];
      durationMs: number;
    }>(`/cloud-functions/${fn.id}/invoke`, {
      input: { value: 21 },
    });

    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).doubled).toBe(42);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('未发布云函数调用应报错', async () => {
    const fn = await api.post<{ id: string }>('/apps/' + appId + '/cloud-functions', {
      apiName: 'e2e_unpublished',
      name: 'E2E 未发布函数',
      code: {
        source: 'async function handler(input) { return input; }',
        language: 'javascript',
      },
    });

    // 不发布直接调用 — 应返回 400
    await expect(api.post(`/cloud-functions/${fn.id}/invoke`, { input: {} })).rejects.toThrow();
  });

  test('云函数日志输出验证', async () => {
    const fn = await api.post<{ id: string }>('/apps/' + appId + '/cloud-functions', {
      apiName: 'e2e_logging',
      name: 'E2E 日志函数',
      code: {
        source:
          'async function handler(input) { context.log("hello from sandbox"); return { msg: "done" }; }',
        language: 'javascript',
      },
    });

    await api.post(`/cloud-functions/${fn.id}/publish`);

    const result = await api.post<{
      success: boolean;
      logs: string[];
    }>(`/cloud-functions/${fn.id}/invoke`, { input: {} });

    expect(result.success).toBe(true);
    expect(result.logs).toContain('hello from sandbox');
  });

  test('UI 中查看云函数列表', async ({ page }) => {
    await page.goto(`/app/${appId}/cloud-functions`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/cloud-functions$/);
  });
});
