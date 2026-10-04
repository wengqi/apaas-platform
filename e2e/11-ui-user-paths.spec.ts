/**
 * E2E 测试 — 真实 UI 用户路径（评审整改回归防线）。
 *
 * 背景（2026-09-26 独立评审）：既有 10 个 spec 全部"API 直调 + UI 断言"，
 * 导致 UI 层前后端契约断链长期 CI 全绿而真实用户路径 100% 失败。本 spec
 * 只通过真实鼠标/键盘操作走完整路径，专门守住这批修复：
 *   1. 新建对象（label→name 契约）
 *   2. 添加字段（必填开关）
 *   3. 新增记录（表单受控绑定 + 单层 JSONB）
 *   4. 记录列表值正确渲染（不再显示 "—"）
 *   5. 新建视图（isDefault 契约）
 *   6. 页面搭建器保存（保存 payload 契约）
 *
 * 数据自建自清：应用通过 UI 创建，测试结束后经 API 删除。
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createApiClient, loginViaApi, deleteTestApp } from './fixtures.js';

const SUFFIX = Date.now().toString().slice(-8);

test.describe('真实 UI 用户路径', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let token = '';

  // 评审整改后登录端点有限流（H-2），测试内只登录一次并复用 token
  test.beforeAll(async () => {
    token = await loginViaApi();
    api = createApiClient(token);
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  /** 通过 UI 创建应用并进入应用。
   *  M4 修复（2026-10-03）后创建成功即自动导航进 /app/:id/dashboard——
   *  断言 URL 直达，避免列表页/侧栏/工作台标题多元素 strict violation；
   *  appId 从目标 URL 提取。 */
  async function createAppViaUi(page: Page): Promise<void> {
    await page.goto('/apps');
    await page.getByRole('button', { name: /创建应用/ }).click();
    const dlg = page.getByRole('dialog', { name: '创建应用' });
    await dlg.getByRole('textbox', { name: '显示名称' }).fill(`UI 路径应用 ${SUFFIX}`);
    await dlg.getByRole('button', { name: '创 建' }).click();
    await expect(page).toHaveURL(/\/app\/[^/]+\/dashboard/, { timeout: 15_000 });
    appId = page.url().split('/app/')[1]!.split('/')[0]!;
  }

  test('UI 全路径：建对象 → 加字段 → 建记录 → 列表渲染 → 建视图 → 保存页面', async ({ page }) => {
    await createAppViaUi(page);

    // ---- 1. 新建对象（回归：前端曾发 label 而后端只认 name → 400）----
    await page.getByRole('menuitem', { name: /对象/ }).click();
    await page.getByRole('button', { name: /新建对象/ }).click();
    const objDlg = page.getByRole('dialog', { name: '新建对象' });
    await objDlg.getByRole('textbox', { name: '显示名称' }).fill('UI 评审项目');
    await objDlg.getByRole('textbox', { name: 'API 名称' }).fill(`ui_review_${SUFFIX}`);
    await objDlg.getByRole('button', { name: '创 建' }).click();

    // 创建成功会跳转到对象详情
    await expect(page).toHaveURL(/\/objects\/[^/]+$/, { timeout: 15_000 });
    const objectId = page.url().split('/objects/')[1]!;
    expect(objectId).toBeTruthy();

    // ---- 2. 添加字段（单行文本 + 必填）----
    await page.getByRole('button', { name: /添加字段/ }).click();
    await page.getByText('单行文本', { exact: true }).click();
    const fieldForm = page.getByRole('dialog', { name: /添加字段/ });
    await fieldForm.getByRole('textbox', { name: '显示名称' }).fill('项目名称');
    await fieldForm.getByRole('textbox', { name: 'API 名称' }).fill('project_name');
    await fieldForm.getByRole('switch', { name: '必填' }).click();
    await fieldForm.getByRole('button', { name: '保 存' }).click();
    await expect(page.getByText('project_name')).toBeVisible({ timeout: 15_000 });

    // ---- 3. 新增记录（回归：表单控件曾非受控 → 必填校验永远失败）----
    await page.getByRole('tab', { name: '数据' }).click();
    await page.getByRole('button', { name: /新增记录/ }).click();
    const recDlg = page.getByRole('dialog', { name: /新增/ });
    await recDlg.getByRole('textbox', { name: /项目名称/ }).fill('UI 评审记录一');
    await recDlg.getByRole('button', { name: '保 存' }).click();

    // ---- 4. 列表渲染（回归：{data} 双层嵌套曾导致值显示 "—"）----
    await expect(page.getByText('共 1 条记录')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('UI 评审记录一')).toBeVisible({ timeout: 10_000 });

    // ---- 5. 新建视图（回归：前端多发 isDefault → 400）----
    await page.getByRole('tab', { name: '视图' }).click();
    await page.getByRole('button', { name: /新建视图/ }).click();
    const viewDlg = page.getByRole('dialog', { name: '新建视图' });
    await viewDlg.getByRole('textbox', { name: '视图名称' }).fill('UI 默认视图');
    await viewDlg.getByRole('button', { name: '创 建' }).click();
    await expect(page.getByText('UI 默认视图')).toBeVisible({ timeout: 15_000 });

    // ---- 6. 保存页面（回归：保存 payload 多发 apiName/type/objectId → 400）----
    const pageMeta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      name: `UI 页面 ${SUFFIX}`,
      apiName: `ui_page_${SUFFIX}`,
      type: 'custom',
    });
    await page.goto(`/app/${appId}/pages/${pageMeta.id}`);
    await expect(page.getByRole('button', { name: /保存/ })).toBeVisible({ timeout: 15_000 });

    // R1.7 第二轮：画布 = amis-editor，无变更时保存禁用（脏态门控）——
    // 点击添加一个组件制造脏态，再保存（保留原回归意图：保存 payload 必须真正落库）
    // 等编辑器初始化规范化窗口（1s）过去，避免添加动作的 onChange 被吸收
    await page.waitForTimeout(1_500);
    await page.getByText('Markdown', { exact: true }).first().click({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /保存/ })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: /保存/ }).click();

    // 保存必须真正落库：轮询页面 schema 含新组件（此前 400 会静默失败）
    await expect
      .poll(
        async () => {
          const res = await fetch(`http://localhost:3000/api/v1/pages/${pageMeta.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = (await res.json()) as { data?: { schema?: { body?: unknown[] } } };
          const body = json.data?.schema?.body ?? [];
          return body.some(
            (b) =>
              typeof b === 'object' && b !== null && (b as { type?: string }).type === 'markdown',
          );
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('流程触发器可配置 + 手动触发流程可启动（回归：UI 断链）', async ({ page }) => {
    // 需要一个已发布的手动触发流程：用 API 建最小流程定义（触发能力本身即为被测对象）
    const client = api;
    const process = await client.post<{ id: string; apiName: string }>(`/apps/${appId}/processes`, {
      apiName: `ui_flow_${SUFFIX}`,
      name: 'UI 手动流程',
      triggerType: 'MANUAL',
      workflowSchema: {
        nodes: [
          { id: 'start_0', type: 'start', meta: {}, data: {} },
          { id: 'end_0', type: 'end', meta: {}, data: {} },
        ],
        edges: [{ id: 'e0', sourceNodeID: 'start_0', targetNodeID: 'end_0' }],
      },
    });
    await client.post(`/processes/${process.id}/publish`, {});

    // 流程列表应显示"启动实例"入口
    await page.goto(`/app/${appId}/processes`);
    await expect(page.getByText('UI 手动流程')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'more' }).first().click();
    await expect(page.getByRole('menuitem', { name: /启动实例/ })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('menuitem', { name: /启动实例/ }).click();
    await page.getByRole('button', { name: '启 动' }).click();
    await expect(page.getByText(/流程已启动/)).toBeVisible({ timeout: 15_000 });
  });
});
