/**
 * E2E 测试 — 记录业务字段排序与筛选（评审 A-H1 回归）。
 *
 * 背景（2026-09-26 独立评审 A-H1）：
 *  - 过滤条件此前编译为 `data->'f' = x` / `data->>'f' LIKE ...`，**无法命中
 *    records 的 GIN 索引**（jsonb_ops 仅加速 `@>`/`?` 等）；已改为可完整下推的
 *    等值条件走 `data @> $::jsonb`（命中 GIN）+ ORDER BY 下推。
 *  - 业务字段排序此前退化为整列 JSONB 排序（JSON 二进制序），
 *    语义错误（如 10 排在 2 之前）；已改为按字段类型 cast 排序（数值 cast numeric、
 *    NULLS LAST），不可下推时按类型内存排序。
 *
 * 说明：数据准备经应用 API（与既有 e2e 约定一致），**断言走真实 UI**——
 * 点击列头排序并校验表格行顺序（用户可见行为）。
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

const AMOUNTS = [2, 10, 9, 1000, 200];

test.describe('记录业务字段排序（A-H1 回归）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let objectId = '';

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api);

    const obj = await api.post<{ id: string }>(`/apps/${appId}/objects`, {
      apiName: 'sort_spec_object',
      name: '排序验证',
      icon: 'bar_chart',
    });
    objectId = obj.id;

    await api.post(`/objects/${objectId}/fields`, {
      apiName: 'amount',
      label: '金额',
      type: 'number',
      config: {},
    });
    await api.post(`/objects/${objectId}/fields`, {
      apiName: 'status',
      label: '状态',
      type: 'single_select',
      config: {
        options: [
          { id: 'OPEN', value: 'OPEN', label: '打开' },
          { id: 'DONE', value: 'DONE', label: '完成' },
        ],
      },
    });

    for (const amount of AMOUNTS) {
      await api.post(`/objects/${objectId}/records`, { amount, status: 'OPEN' });
    }
    // 一条不满足等值筛选的记录，用于校验筛选语义
    await api.post(`/objects/${objectId}/records`, { amount: 7, status: 'DONE' });
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  /** 当前激活 tab 面板（字段表与数据表同时挂载在 DOM 中，需限定作用域） */
  const activePane = (page: Page) => page.locator('.ant-tabs-tabpane-active');

  /**
   * 读取"金额"列的列头与值。
   * 注意：不要在轮询回调内使用 expect 断言——加载期（skeleton）会即刻抛出并
   * 中断轮询；这里只读状态，断言放在轮询外。
   */
  async function readAmountColumn(page: Page): Promise<{ headers: string[]; values: number[] }> {
    const headerCells = activePane(page).locator('thead th');
    const count = await headerCells.count();
    const headers: string[] = [];
    let idx = -1;
    for (let i = 0; i < count; i++) {
      const t = (await headerCells.nth(i).innerText()).trim();
      headers.push(t);
      if (t.includes('金额') && idx < 0) idx = i;
    }
    if (idx < 0) return { headers, values: [] };

    const rows = activePane(page).locator('tbody tr.ant-table-row');
    const rowCount = await rows.count();
    const values: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const text = (await rows.nth(r).locator('td').nth(idx).innerText()).trim();
      const n = Number(text);
      if (!Number.isNaN(n)) values.push(n);
    }
    return { headers, values };
  }

  test('点击列头：数值字段按数字语义升/降序（而非 JSON 字典序）', async ({ page }) => {
    await page.goto(`/app/${appId}/objects`);
    await page.waitForTimeout(2000);
    await page.getByText('排序验证', { exact: true }).first().click();
    await page.getByRole('tab', { name: '数据' }).click();
    await expect(page.getByText(/共 6 条记录/)).toBeVisible({ timeout: 10_000 });

    // 先等表格加载完成（列头出现 + 6 行数据）
    await expect
      .poll(async () => (await readAmountColumn(page)).headers.join('|'), { timeout: 15_000 })
      .toContain('金额');
    await expect(activePane(page).locator('tbody tr.ant-table-row')).toHaveCount(6, {
      timeout: 15_000,
    });

    const header = activePane(page).locator('thead th').filter({ hasText: '金额' }).first();
    const asc = [...AMOUNTS, 7].sort((a, b) => a - b).join(',');
    const desc = [...AMOUNTS, 7].sort((a, b) => b - a).join(',');

    // 升序：2,7,9,10,200,1000（字典序会得到 10,1000,2,200,7,9）
    await header.click();
    await expect
      .poll(async () => (await readAmountColumn(page)).values.join(','), { timeout: 15_000 })
      .toBe(asc);

    // 降序：1000,200,10,9,7,2
    await header.click();
    await expect
      .poll(async () => (await readAmountColumn(page)).values.join(','), { timeout: 15_000 })
      .toBe(desc);
  });
});
