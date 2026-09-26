/**
 * E2E 测试 — 流程配置侧栏交互（BUG-05 回归防线）。
 *
 * 背景（2026-09-26 独立评审 BUG-05）：配置侧栏曾通过 createPortal 挂到
 * document.body，跨出应用 React root 容器后事件委托不可靠——刷新/恢复页面后
 * 侧栏内所有 AntD Select 与 Input 表现为"事件已到达 DOM 但 React 不更新"：
 * 下拉打不开、输入框无法录入、关闭按钮无响应。修复为在应用 root 内渲染
 * （position: fixed），本 spec 守住该行为，尤其是"刷新之后"这一关键场景。
 *
 * 说明：流程定义通过 API 预置（触发/引擎逻辑不在本用例范围内），
 * 被测对象是侧栏在真实页面中的交互能力。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('流程配置侧栏交互（BUG-05 回归）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let processId = '';

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api);
    const process = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: 'bug05_sidebar_flow',
      name: '侧栏交互流程',
      triggerType: 'MANUAL',
      workflowSchema: {
        nodes: [
          { id: 'start_0', type: 'start', meta: {}, data: {} },
          { id: 'user_task_0', type: 'user_task', meta: {}, data: { title: '人工任务' } },
          { id: 'end_0', type: 'end', meta: {}, data: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeID: 'start_0', targetNodeID: 'user_task_0' },
          { id: 'e2', sourceNodeID: 'user_task_0', targetNodeID: 'end_0' },
        ],
      },
    });
    processId = process.id;
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api);
  });

  /** 打开编辑器并选中人工任务节点，返回侧栏定位器。 */
  async function openSidebar(page: import('@playwright/test').Page) {
    await page.getByTestId('flow-node').filter({ hasText: '人工任务' }).first().click();
    const sidebar = page.locator('.apaas-config-sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    // 机制守护（BUG-05 根因）：侧栏必须渲染在应用 React root 容器内。
    // 历史上它通过 createPortal 挂到 document.body，跨出 root 后事件委托
    // 在画布编辑器的全局监听环境下不可靠（事件到达 DOM 但 React 不更新）。
    const insideRoot = await sidebar.evaluate(
      (el) => !!document.getElementById('root')?.contains(el),
    );
    expect(insideRoot, '配置侧栏必须渲染于 #root 内（不得 portal 到 document.body）').toBe(true);
    return sidebar;
  }

  /** 断言侧栏内下拉可展开、输入框可录入（BUG-05 的两个症状）。 */
  async function assertSidebarInteractive(
    page: import('@playwright/test').Page,
    sidebar: ReturnType<typeof page.locator>,
  ) {
    // 1) 下拉可展开：点击"审批人类型"Select，应出现可见选项
    //    注意：不能用 getByRole('option')——rc-select 另有一份宽度为 0 的隐藏
    //    ARIA 列表（用于无障碍），Playwright 会判定其不可见；可见行是 .ant-select-item-option
    await sidebar.locator('.ant-select').first().click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    await expect(dropdown.locator('.ant-select-item-option', { hasText: '指定用户' })).toBeVisible({
      timeout: 5_000,
    });
    await page.keyboard.press('Escape');

    // 2) 输入框可录入：任务名称应能接受键盘输入并保持
    const nameInput = sidebar.getByPlaceholder('合同审批');
    await nameInput.click();
    await nameInput.fill('侧栏交互验证');
    await expect(nameInput).toHaveValue('侧栏交互验证');
  }

  test('首次进入：侧栏内下拉与输入可用', async ({ page }) => {
    await page.goto(`/app/${appId}/processes/${processId}`);
    await page.waitForTimeout(2500);
    const sidebar = await openSidebar(page);
    await assertSidebarInteractive(page, sidebar);
  });

  test('刷新页面后：侧栏内下拉与输入仍可用（BUG-05 核心场景）', async ({ page }) => {
    await page.goto(`/app/${appId}/processes/${processId}`);
    await page.waitForTimeout(2500);
    await openSidebar(page);

    // 刷新（恢复页面）。刷新前已选中节点，侧栏会随之恢复或需重新点击节点。
    await page.reload();
    await page.waitForTimeout(3000);

    let sidebar = page.locator('.apaas-config-sidebar');
    if (!(await sidebar.isVisible().catch(() => false))) {
      sidebar = await openSidebar(page);
    }

    // 关闭按钮必须可用（此前刷新后 ✕ 亦失效）
    await sidebar.locator('button').first().click();
    await expect(page.locator('.apaas-config-sidebar')).toBeHidden({ timeout: 5_000 });

    // 重新打开并验证交互（BUG-05 症状：下拉打不开 / 输入不生效）
    const reopened = await openSidebar(page);
    await assertSidebarInteractive(page, reopened);
  });
});
