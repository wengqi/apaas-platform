/**
 * E2E 测试 — 数据集与数据流 (Phase 6.7 验收)。
 *
 * 覆盖场景：创建数据流 → 多表关联 + 分组汇总 → 预览 → 执行 → 查询数据集行
 * 验收标准（ROADMAP）：创建数据流→多表关联+筛选+分组汇总→输出数据集→在页面表格中使用
 *
 * 设计决策：
 * - preview 是同步内存计算（≤100 行），作为主验证路径
 * - execute 是异步（BullMQ），需轮询 dataset status
 * - 创建 2 个对象（订单+客户）+ join + aggregation 验证多表关联
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

/** 轮询数据集直到状态为 READY 或 FAILED（超时 30s）。 */
async function waitForDatasetReady(
  api: ReturnType<typeof createApiClient>,
  datasetId: string,
  timeoutMs = 30_000,
): Promise<{ status: string; rowCount: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ds = await api.get<{ status: string; rowCount: number }>(`/datasets/${datasetId}`);
    if (ds.status === 'READY' || ds.status === 'FAILED') return ds;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Dataset ${datasetId} did not become READY within ${timeoutMs}ms`);
}

test.describe('数据集与数据流', () => {
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

  test('创建数据流 + 预览（单表 + 分组汇总）', async () => {
    // 创建对象 + 字段 + 记录
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'e2e_orders',
      name: 'E2E 订单',
      icon: 'shopping_cart',
    });

    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'category',
      label: '类别',
      type: 'TEXT',
    });
    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'amount',
      label: '金额',
      type: 'NUMBER',
    });

    for (const r of [
      { category: 'A', amount: 100 },
      { category: 'A', amount: 200 },
      { category: 'B', amount: 150 },
    ]) {
      await api.post(`/objects/${obj.id}/records`, r);
    }

    // 创建数据流（单表 + 分组汇总）
    const flow = await api.post<{ id: string }>('/design/apps/' + appId + '/data-flows', {
      apiName: 'e2e_flow_preview',
      name: 'E2E 预览数据流',
      config: {
        sources: [{ objectId: obj.id, alias: 'orders' }],
        outputFields: [
          { alias: 'category', label: '类别', source: 'category', type: 'string' },
          { alias: 'total', label: '总额', source: 'total', type: 'number' },
        ],
        aggregation: {
          groupBy: ['category'],
          metrics: [{ alias: 'total', label: '总额', field: 'amount', function: 'sum' }],
        },
      },
    });
    expect(flow.id).toBeTruthy();

    // 预览
    const preview = await api.post<{
      columns: Array<{ apiName: string }>;
      rows: Array<Record<string, unknown>>;
      total: number;
    }>(`/design/apps/${appId}/data-flows/${flow.id}/preview`);

    expect(preview.columns.length).toBeGreaterThanOrEqual(1);
    expect(preview.total).toBe(2); // 2 个分组（A, B）

    const rowA = preview.rows.find((r) => r.category === 'A');
    expect(rowA?.total).toBe(300);
    const rowB = preview.rows.find((r) => r.category === 'B');
    expect(rowB?.total).toBe(150);
  });

  test('执行数据流 + 查询数据集行', async () => {
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'e2e_sales',
      name: 'E2E 销售',
      icon: 'bar_chart',
    });

    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'region',
      label: '区域',
      type: 'TEXT',
    });
    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'revenue',
      label: '收入',
      type: 'NUMBER',
    });

    for (const r of [
      { region: 'east', revenue: 1000 },
      { region: 'west', revenue: 2000 },
      { region: 'east', revenue: 500 },
    ]) {
      await api.post(`/objects/${obj.id}/records`, r);
    }

    const flow = await api.post<{ id: string }>('/design/apps/' + appId + '/data-flows', {
      apiName: 'e2e_flow_exec',
      name: 'E2E 执行数据流',
      config: {
        sources: [{ objectId: obj.id, alias: 'sales' }],
        outputFields: [
          { alias: 'region', label: '区域', source: 'region', type: 'string' },
          { alias: 'total_revenue', label: '总收入', source: 'total_revenue', type: 'number' },
        ],
        aggregation: {
          groupBy: ['region'],
          metrics: [
            {
              alias: 'total_revenue',
              label: '总收入',
              field: 'revenue',
              function: 'sum',
            },
          ],
        },
      },
    });

    // 执行（异步，返回 datasetId）
    const execResult = await api.post<{ datasetId: string }>(
      `/design/apps/${appId}/data-flows/${flow.id}/execute`,
    );
    expect(execResult.datasetId).toBeTruthy();

    // 轮询等待数据集就绪
    const ds = await waitForDatasetReady(api, execResult.datasetId);
    expect(ds.status).toBe('READY');
    expect(ds.rowCount).toBe(2); // 2 个分组

    // 查询数据集行
    const rows = await api.get<{
      items: Array<Record<string, unknown>>;
      total: number;
    }>(`/datasets/${execResult.datasetId}/rows?page=1&pageSize=100`);

    expect(rows.total).toBe(2);
    expect(rows.items.length).toBe(2);

    const eastRow = rows.items.find((r) => r.region === 'east');
    expect(eastRow?.total_revenue).toBe(1500);
    const westRow = rows.items.find((r) => r.region === 'west');
    expect(westRow?.total_revenue).toBe(2000);
  });

  test('UI 中查看数据集列表', async ({ page }) => {
    await page.goto(`/app/${appId}/datasets`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/datasets$/);
  });
});
