/**
 * E2E 测试 — 仪表盘与图表 (Phase 7.7 + 7.8)。
 *
 * 覆盖场景：
 * 1. 创建仪表盘页面自动生成 DashboardGrid 模板（含指标卡 + 趋势图）
 * 2. 更新仪表盘网格布局
 * 3. 后端聚合 API：对象记录 sum/count/avg 聚合
 * 4. 时间分桶：day 粒度分桶 + 时间排序
 * 5. 指标卡标量聚合：无 categoryField 返回单值
 * 6. 图表配置 + 运行时预览
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

  // -------------------------------------------------------------------------
  // 模板验证（原有测试）
  // -------------------------------------------------------------------------

  test('创建仪表盘页面自动生成 DashboardGrid 模板（含指标卡 + 趋势图）', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
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
            children?: Array<{ type: string; props?: Record<string, unknown> }>;
          }>;
        };
      };
    }>(`/pages/${page_meta.id}`);

    const rootChildren = detail.schema.root.children ?? [];
    const dashboardGrid = rootChildren.find((c) => c.type === 'dashboard_grid');
    expect(dashboardGrid).toBeTruthy();
    expect(dashboardGrid?.props?.layout).toBeTruthy();
    // 模板应包含指标卡(statistic) + 趋势图(chart) + 其他图表
    const widgetTypes = (dashboardGrid?.children ?? []).map((c) => c.type);
    expect(widgetTypes).toContain('statistic');
    expect(widgetTypes).toContain('chart');
    expect(dashboardGrid?.children?.length).toBeGreaterThanOrEqual(4);

    // 趋势图应含 timeGranularity 配置
    const trendChart = (dashboardGrid?.children ?? []).find(
      (c) => c.type === 'chart' && c.props?.chartType === 'line',
    );
    expect(trendChart?.props?.timeGranularity).toBe('day');

    // 指标卡应含 aggregation 配置
    const metricCard = (dashboardGrid?.children ?? []).find(
      (c) => c.type === 'statistic' && c.props?.aggregation,
    );
    expect(metricCard?.props?.aggregation).toBeTruthy();
  });

  test('更新仪表盘网格布局', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'e2e_dashboard_layout',
      name: 'E2E布局测试',
      type: 'dashboard',
    });

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

    const grid = schema.root.children[0];
    grid.props.cols = 24;
    grid.props.rowHeight = 40;

    await api.put(`/pages/${page_meta.id}`, { schema });

    const updated = await api.get<{
      schema: { root: { children: Array<{ props: { cols: number } }> } };
    }>(`/pages/${page_meta.id}`);
    expect(updated.schema.root.children[0].props.cols).toBe(24);
  });

  // -------------------------------------------------------------------------
  // 后端聚合 API 测试（Phase 7.7 — 图表数据聚合引擎）
  // -------------------------------------------------------------------------

  test('后端聚合 API：对象记录 sum/count/avg 聚合', async () => {
    // 创建对象 + 数值字段
    const obj = await api.post<{ id: string }>(`/apps/${appId}/objects`, {
      apiName: 'e2e_chart_obj',
      name: '图表测试对象',
      icon: 'bar_chart',
    });

    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'category',
      label: '类别',
      type: 'TEXT',
    });
    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'amount',
      label: '金额',
      type: 'NUMBER',
    });

    // 创建测试记录
    const records = [
      { category: 'A', amount: 100 },
      { category: 'A', amount: 200 },
      { category: 'B', amount: 50 },
      { category: 'B', amount: 150 },
      { category: 'C', amount: 300 },
    ];
    for (const r of records) {
      await api.post(`/objects/${obj.id}/records`, r);
    }

    // sum 聚合
    const sumResult = await api.post<{
      data: Array<{ category: string; value: number }>;
      totalRecords: number;
    }>(`/apps/${appId}/datasets/chart-data`, {
      sourceType: 'object',
      sourceId: obj.id,
      categoryField: 'category',
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(sumResult.totalRecords).toBe(5);
    const sumA = sumResult.data.find((d) => d.category === 'A');
    const sumB = sumResult.data.find((d) => d.category === 'B');
    expect(sumA?.value).toBe(300);
    expect(sumB?.value).toBe(200);

    // count 聚合
    const countResult = await api.post<{
      data: Array<{ category: string; value: number }>;
    }>(`/apps/${appId}/datasets/chart-data`, {
      sourceType: 'object',
      sourceId: obj.id,
      categoryField: 'category',
      aggregation: 'count',
    });

    const countA = countResult.data.find((d) => d.category === 'A');
    const countB = countResult.data.find((d) => d.category === 'B');
    expect(countA?.value).toBe(2);
    expect(countB?.value).toBe(2);

    // avg 聚合
    const avgResult = await api.post<{
      data: Array<{ category: string; value: number }>;
    }>(`/apps/${appId}/datasets/chart-data`, {
      sourceType: 'object',
      sourceId: obj.id,
      categoryField: 'category',
      valueField: 'amount',
      aggregation: 'avg',
    });

    const avgA = avgResult.data.find((d) => d.category === 'A');
    expect(avgA?.value).toBe(150);
  });

  test('后端聚合 API：时间分桶 day 粒度 + 时间排序', async () => {
    const obj = await api.post<{ id: string }>(`/apps/${appId}/objects`, {
      apiName: 'e2e_chart_time',
      name: '时间图表测试',
      icon: 'calendar',
    });

    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'date',
      label: '日期',
      type: 'TEXT',
    });
    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'sales',
      label: '销售额',
      type: 'NUMBER',
    });

    // 创建乱序日期记录（验证排序）
    const timeRecords = [
      { date: '2026-01-03', sales: 30 },
      { date: '2026-01-01', sales: 10 },
      { date: '2026-01-02', sales: 20 },
      { date: '2026-01-01', sales: 15 },
    ];
    for (const r of timeRecords) {
      await api.post(`/objects/${obj.id}/records`, r);
    }

    const result = await api.post<{
      categories: string[];
      values: number[];
    }>(`/apps/${appId}/datasets/chart-data`, {
      sourceType: 'object',
      sourceId: obj.id,
      categoryField: 'date',
      valueField: 'sales',
      aggregation: 'sum',
      timeGranularity: 'day',
    });

    // 应按时间升序排列
    expect(result.categories).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(result.values).toEqual([25, 20, 30]);
  });

  test('后端聚合 API：指标卡标量聚合（无 categoryField）', async () => {
    const obj = await api.post<{ id: string }>(`/apps/${appId}/objects`, {
      apiName: 'e2e_chart_metric',
      name: '指标卡测试',
      icon: 'dashboard',
    });

    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'amount',
      label: '金额',
      type: 'NUMBER',
    });

    for (const amount of [100, 200, 300]) {
      await api.post(`/objects/${obj.id}/records`, { amount });
    }

    // 标量 sum — 无 categoryField
    const sumResult = await api.post<{
      data: Array<{ category: string; value: number }>;
      totalRecords: number;
    }>(`/apps/${appId}/datasets/chart-data`, {
      sourceType: 'object',
      sourceId: obj.id,
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(sumResult.data).toHaveLength(1);
    expect(sumResult.data[0]!.value).toBe(600);

    // 标量 count — 无 categoryField + 无 valueField
    const countResult = await api.post<{
      data: Array<{ category: string; value: number }>;
    }>(`/apps/${appId}/datasets/chart-data`, {
      sourceType: 'object',
      sourceId: obj.id,
      aggregation: 'count',
    });

    expect(countResult.data).toHaveLength(1);
    expect(countResult.data[0]!.value).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 图表配置 + 运行时预览（Phase 7.8 验收）
  // -------------------------------------------------------------------------

  test('图表配置 + 运行时预览（创建仪表盘 → 配置图表 → 发布 → 访问运行时）', async () => {
    // 1. 创建测试对象 + 数据
    const obj = await api.post<{ id: string }>(`/apps/${appId}/objects`, {
      apiName: 'e2e_preview_obj',
      name: '预览测试对象',
      icon: 'bar_chart',
    });

    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'category',
      label: '类别',
      type: 'TEXT',
    });
    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'amount',
      label: '金额',
      type: 'NUMBER',
    });

    for (const r of [
      { category: 'X', amount: 100 },
      { category: 'Y', amount: 200 },
      { category: 'X', amount: 50 },
    ]) {
      await api.post(`/objects/${obj.id}/records`, r);
    }

    // 2. 创建仪表盘页面
    const dashPage = await api.post<{ id: string; slug: string }>(`/apps/${appId}/pages`, {
      apiName: 'e2e_preview_dash',
      name: '预览仪表盘',
      type: 'dashboard',
    });

    // 3. 获取模板并配置图表数据源
    const detail = await api.get<{ schema: unknown }>(`/pages/${dashPage.id}`);
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
          props: Record<string, unknown>;
          children: Array<{ id: string; type: string; props: Record<string, unknown> }>;
        }>;
      };
    };

    // 找到图表组件，配置数据源
    const grid = schema.root.children[0];
    for (const child of grid.children) {
      if (child.type === 'chart' || child.type === 'statistic') {
        child.props.datasourceType = 'object';
        child.props.datasourceId = obj.id;
        if (child.type === 'chart') {
          child.props.categoryField = 'category';
          child.props.valueField = 'amount';
        }
      }
    }

    await api.put(`/pages/${dashPage.id}`, { schema });

    // 4. 发布应用（运行时 slug 端点读取应用级 publishedSnapshot，
    //    页面级 isPublished 标志不会填充快照）
    await api.post(`/apps/${appId}/publish`, {
      version: `1.0.${Date.now() % 1000}`,
      description: 'E2E 图表预览发布',
    });

    // 5. 通过 slug 访问运行时页面
    const runtimePage = await api.get<{
      slug: string;
      schema: unknown;
    }>(`/apps/${appId}/pages/slug/${dashPage.slug}`);

    expect(runtimePage.slug).toBe(dashPage.slug);
    // 验证运行时 schema 包含配置好的图表
    const runtimeSchema = runtimePage.schema as {
      root: {
        children: Array<{
          type: string;
          children: Array<{ type: string; props: Record<string, unknown> }>;
        }>;
      };
    };
    const runtimeGrid = runtimeSchema.root.children[0];
    const configuredChart = runtimeGrid.children.find(
      (c) => c.type === 'chart' && c.props.datasourceId === obj.id,
    );
    expect(configuredChart).toBeTruthy();
    expect(configuredChart?.props.categoryField).toBe('category');
    expect(configuredChart?.props.valueField).toBe('amount');
  });

  test('UI 中查看仪表盘页面搭建器', async ({ page }) => {
    await page.goto(`/app/${appId}/pages`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/pages$/);
  });
});
