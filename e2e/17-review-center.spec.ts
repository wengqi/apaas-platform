/**
 * E2E 测试 — 审核中心与 R1.2 版本模型治理闭环。
 *
 * 验证 AI 出稿 → 人审 diff 快审 → 批/驳 的完整治理轨道：
 *  1. MCP submit_page_draft 产生 PENDING 待审单（不落活表）；
 *  2. 审核中心 UI 看到待审单，批准后页面落活表；
 *  3. 驳回路径：意见回传（list 提交单 API），页面保持不落活表；
 *  4. 撤销未提交：人工修改漂移后可恢复到基线快照。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

const API_BASE = 'http://localhost:3000/api/v1';

test.describe('审核中心与版本模型（R1.2）', () => {
  let api: ReturnType<typeof createApiClient>;
  let token = '';
  let appId = '';
  let objectId = '';
  const pageApiName = `review_spec_page_${Date.now()}`;

  /** MCP JSON-RPC 工具调用（Streamable HTTP JSON 模式）。 */
  async function mcpCall(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
    });
    const json = (await res.json()) as {
      result?: { structuredContent?: Record<string, unknown> };
    };
    return json.result?.structuredContent ?? {};
  }

  test.beforeAll(async () => {
    token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api, `审核中心 E2E ${Date.now()}`);

    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: `review_spec_object_${Date.now()}`,
      name: '审核验证对象',
      icon: 'box',
    });
    objectId = obj.id;
    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: 'title',
      label: '标题',
      type: 'text',
      config: {},
    });
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  test('侧边栏出现审核中心入口（带徽标）', async ({ page }) => {
    await page.goto(`/app/${appId}/dashboard`);
    await expect(page.getByRole('menuitem', { name: /审核中心/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('AI 提交页面草稿 → 待审不落活表 → 批准后落地', async ({ page }) => {
    // 1. MCP 提交 → PENDING 待审单
    const submit = await mcpCall('submit_page_draft', {
      appId,
      apiName: pageApiName,
      name: '合同台账页',
      type: 'list_page',
      schema: {
        type: 'page',
        title: '合同台账',
        body: [
          {
            type: 'form',
            title: '查询',
            body: [{ type: 'input-text', name: 'title', label: '标题' }],
          },
        ],
      },
    });
    expect(submit['ok']).toBe(true);
    expect(submit['status']).toBe('PENDING');
    const submissionId = submit['submissionId'] as string;

    // 2. 提交未落活表：页面列表无该页面
    const pagesBefore = await api.get<Array<{ apiName?: string; slug?: string }>>(
      `/design/apps/${appId}/pages`,
    );
    expect(pagesBefore.some((p) => (p.apiName ?? p.slug) === pageApiName)).toBe(false);

    // 3. 审核中心 UI：待审列表出现该提交单
    await page.goto(`/app/${appId}/reviews`);
    const row = page.getByRole('row', { name: /合同台账页/ });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 4. 打开 diff 抽屉 → 批准
    await row.getByRole('button', { name: /查看 diff/ }).click();
    const approveBtn = page.getByRole('button', { name: /批\s*准/ });
    await expect(approveBtn).toBeVisible({ timeout: 10_000 });
    await approveBtn.click();

    // 5. 批准后落活表
    await expect
      .poll(
        async () => {
          const pages = await api.get<Array<{ apiName?: string; slug?: string }>>(
            `/design/apps/${appId}/pages`,
          );
          return pages.some((p) => (p.apiName ?? p.slug) === pageApiName);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    void submissionId;
  });

  test('驳回路径：意见回传，资源不落活表', async ({ page }) => {
    const rejectApiName = `review_reject_page_${Date.now()}`;
    const submit = await mcpCall('submit_page_draft', {
      appId,
      apiName: rejectApiName,
      name: '待驳回页面',
      type: 'custom',
      schema: { type: 'page', title: '待驳回', body: [] },
    });
    expect(submit['ok']).toBe(true);
    const submissionId = submit['submissionId'] as string;

    // 驳回（审核者 API 动作）
    await api.post(`/apps/${appId}/reviews/${submissionId}/reject`, {
      comment: 'E2E 驳回意见：页面命名需带业务前缀',
    });

    // MCP 治理查询回传驳回意见（agent 自修正闭环）
    const submissions = await mcpCall('list_review_submissions', { appId });
    const list = submissions['submissions'] as Array<{
      id: string;
      status: string;
      reviewComment: string | null;
    }>;
    const rejected = list.find((s) => s.id === submissionId);
    expect(rejected?.status).toBe('REJECTED');
    expect(rejected?.reviewComment).toContain('E2E 驳回意见');

    // 页面不落活表
    const pages = await api.get<Array<{ apiName?: string; slug?: string }>>(
      `/design/apps/${appId}/pages`,
    );
    expect(pages.some((p) => (p.apiName ?? p.slug) === rejectApiName)).toBe(false);

    // UI：已处理页签显示已驳回
    await page.goto(`/app/${appId}/reviews`);
    await page.getByText('已处理').click();
    await expect(page.getByText('E2E 驳回意见').first()).toBeVisible({ timeout: 10_000 });
  });

  test('提交基线 + 撤销未提交（恢复基线快照）', async ({ page }) => {
    // 1. 人工提交基线（对象当前态 → APPROVED 基线）
    await api.post(`/apps/${appId}/reviews/submit`, { module: 'OBJECT', entityId: objectId });

    // 2. 人工修改（新增字段）→ 活表漂移
    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: `extra_${Date.now()}`,
      label: '临时字段',
      type: 'text',
      config: {},
    });

    // 3. UI 未提交变更页签 → 出现该对象 → 撤销
    await page.goto(`/app/${appId}/reviews`);
    await page.getByText('未提交变更').click();
    const row = page.getByRole('row', { name: /审核验证对象/ });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: '撤销' }).click();
    // AntD 两字按钮内部插空格（"确 定"），正则需容许
    await page
      .getByRole('button', { name: /确\s*定/ })
      .first()
      .click();

    // 4. 撤销后字段恢复基线（临时字段消失）
    await expect
      .poll(
        async () => {
          const obj = await api.get<{ fields: Array<{ apiName: string }> }>(
            `/design/apps/${appId}/objects/${objectId}`,
          );
          return obj.fields.some((f) => f.apiName.startsWith('extra_'));
        },
        { timeout: 15_000 },
      )
      .toBe(false);
  });
});
