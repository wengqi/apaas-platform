/**
 * E2E 测试 — 仪表盘与图表。
 *
 * 覆盖场景：创建仪表盘页面 → 验证 DashboardGrid 模板 → 更新布局 → 预览验证
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('仪表盘与图表', () => {
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

  test('创建仪表盘页面自动生成 DashboardGrid 模板', async () => {
    const page_meta = await api.post<{ id: string }>('/pages', {
      apiName: 'e2e_dashboard',
      name: 'E2E仪表盘',
      type: 'dashboard',
    });
    expect(page_meta.id).toBeTruthy();

    const detail = await api.get<{
      schema: {
        root: {
          children?: Array<{
            type: string;
            props?: { layout?: unknown[] };
            children?: unknown[];
          }>;
        };
      };
    }>(`/pages/${page_meta.id}`);

    // 验证模板包含 DashboardGrid 组件
    const rootChildren = detail.schema.root.children ?? [];
    const dashboardGrid = rootChildren.find((c) => c.type === 'dashboard_grid');
    expect(dashboardGrid).toBeTruthy();
    expect(dashboardGrid?.props?.layout).toBeTruthy();
    // DashboardGrid 应包含子组件（图表 + 统计数字）
    expect(dashboardGrid?.children?.length).toBeGreaterThanOrEqual(3);
  });

  test('更新仪表盘网格布局', async () => {
    const page_meta = await api.post<{ id: string }>('/pages', {
      apiName: 'e2e_dashboard_layout',
      name: 'E2E布局测试',
      type: 'dashboard',
    });

    // 获取自动生成的模板
    const detail = await api.get<{ schema: unknown }>(`/pages/${page_meta.id}`);
    const schema = detail.schema as {
      version: string;
      pageType: string;
      viewModel: { variables: Record<string, unknown> };
      root: {
        id: string;
        type: string;
        props: Record<string, unknown>;
        children: Array<{
          id: string;
          type: string;
          name: string;
          props: { cols: number; rowHeight: number; layout: Array<Record<string, unknown>> };
          children: Array<{ id: string; type: string; props: Record<string, unknown> }>;
        }>;
      };
    };

    // 修改网格布局参数
    const grid = schema.root.children[0];
    grid.props.cols = 24;
    grid.props.rowHeight = 40;

    await api.put(`/pages/${page_meta.id}`, { schema });

    // 验证更新已保存
    const updated = await api.get<{
      schema: { root: { children: Array<{ props: { cols: number } }> } };
    }>(`/pages/${page_meta.id}`);
    expect(updated.schema.root.children[0].props.cols).toBe(24);
  });

  test('UI 中查看仪表盘页面搭建器', async ({ page }) => {
    await page.goto(`/app/${appId}/pages`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/pages$/);
  });
});
