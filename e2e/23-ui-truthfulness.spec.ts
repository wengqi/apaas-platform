/**
 * E2E 测试 — Studio 编辑器 UI 真实性不变量（四轮用户反馈的教训固化）。
 *
 * 背景：2026-10-06 用户连续指出四个"明显"问题（二次发布报错/已发布流程
 * 配置面板打不开/已发布却标"未保存"/已配置节点标红"有未完成的配置"）——
 * 全部是功能测试通过但**状态标签说谎**的缺陷。本 spec 把"标签不得与
 * 状态矛盾"固化为断言，防回归。
 *
 * 夹具：复用/自建 API 创建的流程（extInfo 为空场景——双轨 bug 的触发器）。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, loginViaApiWithUser } from './fixtures.js';

const STUDIO_BASE = 'http://localhost:5173';
const PERSIST_KEY = 'apaas:auth';

/** 管理员登录态注入 studio（API 登录 + zustand persist 直写，绕登录限流）。 */
async function injectAdminAuth(page: import('@playwright/test').Page): Promise<void> {
  const { token, user } = await loginViaApiWithUser();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PERSIST_KEY, JSON.stringify({ state: { token, user }, version: 0 })],
  );
}

test.describe('编辑器 UI 真实性不变量', () => {
  let admin: ReturnType<typeof createApiClient>;
  let appId = '';
  let publishedFlowId = '';

  test.beforeAll(async () => {
    const token = await loginViaApi();
    admin = createApiClient(token);

    // 定位/创建反馈环夹具应用（e2e/22 同款，API 创建 = extInfo 空场景）
    const apps = await admin.get<Array<{ id: string; apiName: string }>>('/apps');
    const app = apps.find((a) => a.apiName === 'e2e_feedback_loop');
    if (!app) {
      test.skip(true, '反馈环夹具应用不存在（e2e/22 未运行）');
      return;
    }
    appId = app.id;

    const flows = await admin.get<Array<{ id: string; apiName: string; status: string }>>(
      `/apps/${appId}/processes`,
    );
    const flow = flows.find(
      (f) => f.apiName === 'feedback_approval_v2' && f.status === 'PUBLISHED',
    );
    if (!flow) {
      test.skip(true, '已发布的 v2 流程不存在（e2e/22 未运行）');
      return;
    }
    publishedFlowId = flow.id;
  });

  test('已发布流程编辑器：不标"未保存"，完整节点不标红，摘要可见', async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto(`${STUDIO_BASE}/app/${appId}/processes/${publishedFlowId}`);
    await expect(page.getByRole('heading', { name: /反馈审批流/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('已发布', { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // 不变量 1：已发布 ≠ 未保存（e5ab331 回归）
    await expect(page.getByText('未保存', { exact: true })).toHaveCount(0);
    // 不变量 2：配置完整的节点不标红（2ae24e8 回归——API 创建流程 extInfo 为空场景）
    await expect(page.getByText('有未完成的配置')).toHaveCount(0);
    // 不变量 3：节点卡片显示真实配置摘要（数据驱动的摘要而非空白）
    await expect(page.getByText(/指定角色/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('对照组：真不完整的流程仍会标红（检测器没有被一并禁掉）', async ({ page }) => {
    await injectAdminAuth(page);
    // 自建不完整流程草稿（user_task 缺审批人）
    const created = await admin.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: `incomplete_probe_${Date.now() % 100000}`,
      name: '真实性对照-缺审批人',
      triggerType: 'MANUAL',
      workflowSchema: {
        nodes: [
          { id: 's', type: 'start', data: { title: '开始' } },
          { id: 't', type: 'user_task', data: { title: '缺审批人', approvalMode: 'SINGLE' } },
          { id: 'e', type: 'end', data: { title: '结束' } },
        ],
        edges: [
          { sourceNodeID: 's', targetNodeID: 't' },
          { sourceNodeID: 't', targetNodeID: 'e' },
        ],
      },
    });

    await page.goto(`${STUDIO_BASE}/app/${appId}/processes/${created.id}`);
    await expect(page.getByText('缺审批人')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('有未完成的配置').first()).toBeVisible({ timeout: 10_000 });

    // 清理
    await admin.delete(`/processes/${created.id}`).catch(() => undefined);
  });

  test('发布向导：建议版本号不与任何历史版本冲突（b00f989 回归）', async ({ page }) => {
    await injectAdminAuth(page);
    // 造两条历史版本差异：直接读现有版本列表
    const versions = await admin.get<Array<{ versionNumber: string }>>(`/apps/${appId}/versions`);
    expect(versions.length, '夹具应用应已有发布版本').toBeGreaterThan(0);

    await page.goto(`${STUDIO_BASE}/app/${appId}/publish`);
    await expect(page.getByText('发布新版本')).toBeVisible({ timeout: 15_000 });
    // 向导预填的版本号（patch+1 智能建议）
    const suggested = await page.getByPlaceholder('请输入版本号，如 1.2.1').inputValue();
    expect(suggested).toMatch(/^\d+\.\d+\.\d+$/);
    const existing = new Set(versions.map((v) => v.versionNumber));
    expect(existing.has(suggested), `建议版本 ${suggested} 不应与历史版本冲突`).toBe(false);

    // 完整走一次发布（证明建议版本可直接用——二次发布不报"版本已存在"）
    await page.getByPlaceholder('请输入更新说明').fill(`真实性不变量回归 ${suggested}`);
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '确认发布' }).click();
    await expect(page.getByText(/发布成功|版本历史/).first()).toBeVisible({ timeout: 15_000 });
  });
});
