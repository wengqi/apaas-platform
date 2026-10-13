/**
 * E2E 测试 — 审批页数据可见性（DOM 级，runtime 5174 真实浏览器）。
 *
 * 背景：2026-10-02 验收应用打磨轮发现"审批页字段全 '-' 盲审"缺陷——16/19/20 号
 * spec 全部 API 驱动，"审批人实际看到什么"零断言，该缺陷自 R1.3 起潜伏两轮未被发现。
 * 本 spec 补上唯一的回归网，走真实用户路径：
 *   登录 runtime（5174）→ 任务中心打开审批弹窗 → 合同字段真实可见（非 "-"）
 *   → 弹窗内批准 → 引擎推进至实例完成（UI 动作驱动引擎的端到端证明）。
 * 盲审类缺陷（data prop 遮蔽 / 页面绑定错 slug / 模板字段名不符）在此现形。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './fixtures.js';

const RUNTIME_BASE = 'http://localhost:5174';

test.describe('审批页数据可见性（DOM 级）', () => {
  let admin: ReturnType<typeof createApiClient>;
  let appId = '';
  let contractObjId = '';
  let processDefId = '';

  test.beforeAll(async () => {
    admin = createApiClient(await loginViaApi());

    const apps = await admin.get<Array<{ id: string; apiName: string }>>('/apps');
    appId = apps.find((a) => a.apiName === 'procurement')!.id;

    const objects = await admin.get<Array<{ id: string; apiName: string }>>(
      `/apps/${appId}/objects`,
    );
    contractObjId = objects.find((o) => o.apiName === 'contract')!.id;

    const processes = await admin.get<Array<{ id: string; apiName: string }>>(
      `/apps/${appId}/processes`,
    );
    processDefId = processes.find((p) => p.apiName === 'contract_approval')!.id;
  });

  test('审批人登录 runtime 打开审批弹窗：合同字段真实可见 → 弹窗内批准 → 实例完成', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const contractName = `E2E 可见性合同 ${Date.now()}`;
    const amount = 356_000;

    // 清理 admin 全部历史待办（CI 串行下 20 号 spec ⑦ 的钉版本实例也会留下
    // 待审任务）——保证 UI 待办唯一可定位；complete 驱动残留实例推进，测试库无害
    const pendingBefore = await admin.get<Array<{ id: string }>>(
      '/tasks?status=pending&pageSize=50',
    );
    for (const t of pendingBefore) {
      await admin
        .post(`/tasks/${t.id}/complete`, { decision: 'approve', comment: 'e2e 清理历史待办' })
        .catch(() => undefined);
    }

    // 造合同记录 → RECORD_CREATED 触发审批（小额 → 单人审批路径，任务只派给 admin）
    const rec = await admin.post<{ id: string }>(`/objects/${contractObjId}/records`, {
      contract_name: contractName,
      supplier_name: '可见性验收供应商',
      amount,
      status: 'PENDING',
      sign_date: '2026-10-02',
    });

    // 反查实例（按 triggerContext.recordId）+ 等待待办到达
    let instanceId = '';
    const instDeadline = Date.now() + 15_000;
    while (Date.now() < instDeadline && !instanceId) {
      const instances = await admin.get<
        Array<{ id: string; triggerContext?: { recordId?: string | null } }>
      >(`/processes/${processDefId}/instances`);
      instanceId =
        instances.find((i) => (i.triggerContext?.recordId as string | undefined) === rec.id)?.id ??
        '';
      if (!instanceId) await new Promise((r) => setTimeout(r, 500));
    }
    expect(instanceId).toBeTruthy();

    let taskId = '';
    const taskDeadline = Date.now() + 15_000;
    while (Date.now() < taskDeadline && !taskId) {
      const tasks = await admin.get<Array<{ id: string; instanceId: string }>>(
        '/tasks?status=pending&pageSize=50',
      );
      taskId = tasks.find((t) => t.instanceId === instanceId)?.id ?? '';
      if (!taskId) await new Promise((r) => setTimeout(r, 500));
    }
    expect(taskId).toBeTruthy();

    // ---- 真实用户路径：runtime 登录页 → 任务中心 → 打开审批弹窗 ----
    await page.goto(`${RUNTIME_BASE}/login`);
    await page.getByPlaceholder('如 demo').fill('demo');
    await page.getByPlaceholder('name@company.com').fill(SUPERADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await page.waitForURL('**/home', { timeout: 15_000 });

    await page.goto(`${RUNTIME_BASE}/tasks`);
    // 按任务名定位行（seed 小额路径 = 「小额合同审批」），防其他流程待办混入干扰
    await page
      .getByRole('row', { name: /小额合同审批/ })
      .getByRole('button', { name: /处\s*理/ })
      .click();

    // 盲审回归网（核心断言）：审批弹窗必须渲染真实合同数据。
    // 模板 = seed 审批页 tpl「合同名称：${contract_name}　供应商：${supplier_name}」等，
    // 曾因 data prop 遮蔽全显 "-"——任何一端数据合同破坏（遮蔽回归/绑定错页/字段改名）在此现形。
    await expect(page.getByText(`合同名称：${contractName}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('供应商：可见性验收供应商')).toBeVisible();
    await expect(page.getByText(`合同金额（元）：${amount}`)).toBeVisible();

    // 弹窗内批准（用户决策路径）→ 弹窗关闭 → 引擎推进至实例完成
    await page.getByRole('button', { name: /批\s*准/ }).click();
    await expect(page.getByText('处理审批任务')).toBeHidden({ timeout: 15_000 });

    let status = '';
    const doneDeadline = Date.now() + 20_000;
    while (Date.now() < doneDeadline) {
      status = (await admin.get<{ status: string }>(`/instances/${instanceId}`)).status;
      if (status === 'COMPLETED') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(status).toBe('COMPLETED');
  });
});
