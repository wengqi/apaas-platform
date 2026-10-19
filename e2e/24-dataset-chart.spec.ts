/**
 * E2E 测试 — J8 数据集报表旅程（影响矩阵缺口① 2026-10-06）。
 *
 * 覆盖"数据集物化 → 看板图表消费端"这条此前无 journey 的腿：
 *   建模对象 → 造记录 → 建数据流（API 聚合）→ 执行物化 → 看板页引用数据集
 *   → 发布 → 运行时打开看板 → chart-data 请求发出且聚合数据正确 + 图表渲染。
 *
 * 夹具全 API 自建（人工提交即时 APPROVED 语义），幂等可重跑。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, loginViaApiWithUser } from './fixtures.js';

const RUNTIME_BASE = 'http://localhost:5174';
const PERSIST_KEY = 'apaas:auth';

test.describe('J8 数据集报表旅程（物化→图表消费端）', () => {
  let admin: ReturnType<typeof createApiClient>;
  let appId = '';
  let objectId = '';
  let datasetId = '';
  const PAGE_SLUG = 'chart_journey_dashboard';

  test.beforeAll(async () => {
    const token = await loginViaApi();
    admin = createApiClient(token);

    // 1. 幂等建应用
    const apps = await admin.get<Array<{ id: string; apiName: string }>>('/design/apps');
    let app = apps.find((a) => a.apiName === 'chart_journey_app');
    if (!app) {
      app = await admin.post<{ id: string; apiName: string }>('/design/apps', {
        name: '报表旅程夹具',
        apiName: 'chart_journey_app',
      });
    }
    appId = app.id;

    // 2. 幂等建对象+字段（对象与字段分离端点）
    const objects = await admin.get<Array<{ id: string; apiName: string }>>(
      `/design/apps/${appId}/objects`,
    );
    let obj = objects.find((o) => o.apiName === 'chart_sales');
    if (!obj) {
      obj = await admin.post<{ id: string }>(`/design/apps/${appId}/objects`, {
        apiName: 'chart_sales',
        name: '销售记录',
      });
      await admin.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
        apiName: 'region',
        label: '区域',
        type: 'text',
      });
      await admin.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
        apiName: 'amount',
        label: '金额',
        type: 'currency',
      });
    }
    objectId = obj.id;

    // 3. 幂等造记录（已知分布：华东 150 = 100+50，华北 200）
    const existing = await admin.get<{
      items: Array<{ id: string; data: Record<string, unknown> }>;
    }>(`/objects/${objectId}/records?pageSize=50`);
    if (existing.items.length === 0) {
      const rows = [
        { region: '华东', amount: 100 },
        { region: '华东', amount: 50 },
        { region: '华北', amount: 200 },
      ];
      for (const r of rows) {
        await admin.post(`/objects/${objectId}/records`, r);
      }
    }

    // 4. 幂等建数据流（区域金额汇总）并执行物化
    const flows = await admin.get<Array<{ id: string; apiName: string }>>(
      `/design/apps/${appId}/data-flows`,
    );
    let flow = flows.find((f) => f.apiName === 'sales_by_region');
    if (!flow) {
      flow = await admin.post<{ id: string }>(`/design/apps/${appId}/data-flows`, {
        apiName: 'sales_by_region',
        name: '区域销售汇总',
        config: {
          sources: [{ objectId, alias: 's' }],
          aggregation: {
            groupBy: ['region'],
            metrics: [
              { alias: 'total_amount', label: '金额合计', field: 'amount', function: 'sum' },
            ],
          },
          outputFields: [
            { alias: 'region', label: '区域', source: 'region', type: 'string' },
            { alias: 'total_amount', label: '金额合计', source: 'total_amount', type: 'number' },
          ],
        },
      });
    }
    const exec = await admin.post<{ datasetId?: string } | string>(
      `/design/apps/${appId}/data-flows/${flow!.id}/execute`,
      {},
    );
    datasetId =
      typeof exec === 'string' ? exec : ((exec as { datasetId?: string }).datasetId ?? '');
    expect(datasetId, '执行数据流应返回数据集 ID').toBeTruthy();

    // 轮询物化 READY
    const deadline = Date.now() + 20_000;
    let status = '';
    while (Date.now() < deadline) {
      const ds = await admin.get<{ status: string; rowCount: number }>(`/datasets/${datasetId}`);
      status = ds.status;
      if (status === 'READY' || status === 'FAILED') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(status, '数据集应物化 READY').toBe('READY');
  });

  test('数据集行聚合正确（华东 150 / 华北 200）', async () => {
    const rows = await admin.get<{ items: Array<Record<string, unknown>> }>(
      `/datasets/${datasetId}/rows`,
    );
    expect(rows.items).toHaveLength(2);
    const byRegion = new Map(
      rows.items.map((r) => [String(r['region']), Number(r['total_amount'])]),
    );
    expect(byRegion.get('华东')).toBe(150);
    expect(byRegion.get('华北')).toBe(200);
  });

  test('发布后看板：chart-data 请求发出、聚合正确、图表渲染', async ({ page }) => {
    // 幂等建看板页（引用数据集 ID——API 创建时已知）
    const pages = await admin.get<Array<{ id: string; slug?: string }>>(
      `/design/apps/${appId}/pages`,
    );
    let dash = pages.find((p) => p.slug === PAGE_SLUG || p.apiName === PAGE_SLUG);
    if (!dash) {
      dash = await admin.post<{ id: string }>(`/design/apps/${appId}/pages`, {
        apiName: PAGE_SLUG,
        name: '销售看板',
        type: 'dashboard',
        schema: {
          type: 'page',
          title: '销售看板',
          body: [
            {
              type: 'chart',
              api: {
                method: 'post',
                url: `/apps/${appId}/datasets/chart-data`,
                data: {
                  sourceId: datasetId,
                  sourceType: 'dataset',
                  aggregation: 'sum',
                  categoryField: 'region',
                  valueField: 'total_amount',
                },
                adaptor:
                  "return {title: {text: '区域销售额'}, tooltip: {}, xAxis: {type: 'category', data: (payload.categories || [])}, yAxis: {type: 'value'}, series: [{type: 'bar', data: (payload.values || [])}]}",
              },
            },
          ],
        },
      });
    }

    // 发布（版本号 = 现有最大 patch + 1，与向导同规则，防撞车）
    const versions = await admin.get<Array<{ versionNumber: string }>>(
      `/design/apps/${appId}/versions`,
    );
    const triples = versions
      .map((v) => v.versionNumber.split('.').map((n) => Number.parseInt(n, 10)))
      .filter((n) => n.length === 3 && n.every((x) => !Number.isNaN(x)));
    triples.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!);
    const top = triples[triples.length - 1] ?? [0, 0, 0];
    const version = `${top[0]}.${top[1]}.${top[2]! + 1}`;
    await admin.post(`/design/apps/${appId}/publish`, { version, description: 'J8 旅程发布' });

    // 管理员登录态注入 + 打开看板
    const { token, user } = await loginViaApiWithUser();
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [PERSIST_KEY, JSON.stringify({ state: { token, user }, version: 0 })],
    );

    // chart-data 响应捕获（页面加载即发请求）
    const respPromise = page.waitForResponse(
      (res) => res.url().includes('/datasets/chart-data') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.goto(`${RUNTIME_BASE}/app/${appId}/p/${PAGE_SLUG}`);
    const resp = await respPromise;
    const body = (await resp.json()) as {
      data?: { categories?: string[]; values?: number[] };
    };
    const categories = body.data?.categories ?? [];
    const values = body.data?.values ?? [];
    expect(categories).toContain('华东');
    expect(categories).toContain('华北');
    const idx = categories.indexOf('华东');
    expect(values[idx]).toBe(150);

    // 图表容器渲染（ECharts canvas）+ 标题
    await expect(page.getByText('销售看板').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  });
});
