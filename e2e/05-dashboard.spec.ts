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

  test('创建仪表盘页面产出 amis 空页 scaffold（v1 模板已退役）', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'e2e_dashboard',
      name: 'E2E仪表盘',
      type: 'dashboard',
    });
    expect(page_meta.id).toBeTruthy();

    // R1.7 第二轮：v1 DashboardGrid 模板已随 v1 渲染轨退役，无 schema 创建
    // 统一产出 amis 空页 scaffold（图表能力由 amis-editor 搭建）
    const detail = await api.get<{ schema: { type?: string; body?: unknown[] } }>(
      `/pages/${page_meta.id}`,
    );
    expect(detail.schema.type).toBe('page');
    expect(Array.isArray(detail.schema.body)).toBe(true);
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

  test('UI 中查看仪表盘页面搭建器', async ({ page }) => {
    await page.goto(`/app/${appId}/pages`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/pages$/);
  });
});
