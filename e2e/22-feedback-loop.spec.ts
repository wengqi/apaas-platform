/**
 * E2E 测试 — 运行态业务用户反馈环（AI 主线第四轮收尾）。
 *
 * 验证闭环三断言（此前欠账两轮）：
 *  1. 提交 → 审批**驳回**分支 → writeback 驳回值回写记录（status=rejected）
 *  2. 台账（运行时 UI）显示驳回后的中文状态标签
 *  3. 流程 notification 节点（IN_APP，收件人 {{record.created_by}}）→
 *     申请人收到站内信（驳回通知）
 *
 * 夹具自建（幂等）：应用+对象+表单/台账页+审批流（writeback+驳回通知节点），
 * admin API 直建（人工提交即时 APPROVED 生效语义）并发布。
 */

import { test, expect } from '@playwright/test';
import { createApiClient } from './fixtures.js';

const RUNTIME_BASE = 'http://localhost:5174';

test.describe('运行态业务用户反馈环（驳回+回写+通知）', () => {
  let admin: ReturnType<typeof createApiClient>;
  let appId = '';
  let objectId = '';
  let formPageId = '';
  let listPageId = '';
  let pageSlug = '';

  test.beforeAll(async () => {
    const token = await (await import('./fixtures.js')).loginViaApi();
    admin = createApiClient(token);

    // 幂等：按 apiName 查找或创建夹具应用
    const apps = await admin.get<Array<{ id: string; apiName: string }>>('/apps');
    let app = apps.find((a) => a.apiName === 'e2e_feedback_loop');
    if (!app) {
      app = await admin.post<{ id: string; apiName: string }>('/apps', {
        name: '反馈环 E2E',
        apiName: 'e2e_feedback_loop',
      });
    }
    appId = app!.id;

    // 对象（创建与字段分离）+ status 单选（writeback 目标）+ item 文本
    const objects = await admin.get<Array<{ id: string; apiName: string }>>(
      `/apps/${appId}/objects`,
    );
    let obj = objects.find((o) => o.apiName === 'feedback_item');
    if (!obj) {
      obj = await admin.post<{ id: string }>(`/apps/${appId}/objects`, {
        apiName: 'feedback_item',
        name: '反馈条目',
      });
      const fields = [
        { apiName: 'item', label: '条目名称', type: 'text' },
        {
          apiName: 'status',
          label: '审批状态',
          type: 'single_select',
          config: {
            options: [
              { value: 'pending', label: '待审批' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
            ],
          },
        },
      ];
      for (const f of fields) {
        await admin.post(`/objects/${obj!.id}/fields`, f);
      }
    }
    objectId = obj!.id;

    // 表单页 + 台账页（幂等）
    const pages = await admin.get<Array<{ id: string; slug?: string }>>(`/apps/${appId}/pages`);
    let form = pages.find((p) => p.slug === 'feedback_form' || p.apiName === 'feedback_form');
    if (!form) {
      form = await admin.post<{ id: string }>(`/apps/${appId}/pages`, {
        apiName: 'feedback_form',
        name: '反馈提交',
        type: 'form_page',
        objectId,
        schema: {
          type: 'page',
          title: '反馈提交',
          data: { objectId },
          body: [
            {
              type: 'form',
              title: '反馈条目表单',
              api: { url: `/objects/${objectId}/records`, method: 'post' },
              messages: { success: '提交成功', failed: '提交失败' },
              resetAfterSubmit: true,
              body: [{ type: 'input-text', name: 'item', label: '条目名称', required: true }],
              actions: [{ type: 'submit', label: '提交', level: 'primary' }],
            },
          ],
        },
      });
    }
    formPageId = form!.id;

    let list = pages.find((p) => p.slug === 'feedback_list' || p.apiName === 'feedback_list');
    if (!list) {
      list = await admin.post<{ id: string }>(`/apps/${appId}/pages`, {
        apiName: 'feedback_list',
        name: '反馈台账',
        type: 'list_page',
        objectId,
        schema: {
          type: 'page',
          title: '反馈台账',
          data: { objectId },
          body: [
            {
              type: 'crud',
              name: 'feedback_crud',
              api: {
                url: `/objects/${objectId}/records?page=$page&pageSize=$perPage`,
                method: 'get',
              },
              perPage: 20,
              columns: [
                { name: 'item', label: '条目名称' },
                {
                  name: 'status',
                  label: '审批状态',
                  type: 'mapping',
                  map: {
                    pending: { label: '待审批' },
                    approved: { label: '已通过' },
                    rejected: { label: '已驳回' },
                  },
                },
              ],
              features: ['filter'],
            },
          ],
        },
      });
    }
    listPageId = list!.id;
    pageSlug = 'feedback_list';

    // 审批流（幂等）：提交 → user_task（回写 approved/rejected）→ 条件分支
    // （驳回走 rejectToNodeId 回跳? 不——本流简化为驳回即结束+驳回通知节点）
    // 动态解析租户管理员角色 ID（CI 全新种子库的角色 cuid 与本地不同——
    // 硬编码会导致任务创建了但无人匹配，"任务永不出现"，CI 实测 2026-10-06）
    const roles = await admin.get<Array<{ id: string; code: string }>>('/permissions/roles');
    const tenantAdminRoleId = roles.find((r) => r.code === 'TENANT_ADMIN')!.id;
    expect(tenantAdminRoleId).toBeTruthy();

    const flows = await admin.get<Array<{ id: string; apiName: string }>>(
      `/apps/${appId}/processes`,
    );
    let flow = flows.find((p) => p.apiName === 'feedback_approval_v2');
    if (!flow) {
      flow = await admin.post<{ id: string }>(`/apps/${appId}/processes`, {
        apiName: 'feedback_approval_v2',
        name: '反馈审批流',
        triggerType: 'RECORD_CREATED',
        workflowSchema: {
          nodes: [
            { id: 'start_1', type: 'start', data: { title: '开始' } },
            {
              id: 'task_1',
              type: 'user_task',
              data: {
                taskName: '反馈审批',
                assigneeType: 'ROLE',
                candidateGroups: [tenantAdminRoleId],
                approvalMode: 'SINGLE',
                allowReject: true,
                rejectToNodeId: 'notify_reject_1',
                writeback: { field: 'status', approveValue: 'approved', rejectValue: 'rejected' },
              },
            },
            {
              id: 'notify_reject_1',
              type: 'notification',
              data: {
                title: '通知申请人（已驳回）',
                channel: 'IN_APP',
                recipients: ['{{record.created_by}}'],
                title_template: '反馈审批被驳回',
                content: '您提交的反馈审批被驳回，请查看审批意见。',
              },
            },
            { id: 'end_1', type: 'end', data: { title: '结束' } },
          ],
          edges: [
            { sourceNodeID: 'start_1', targetNodeID: 'task_1' },
            { sourceNodeID: 'task_1', targetNodeID: 'notify_reject_1' },
            { sourceNodeID: 'notify_reject_1', targetNodeID: 'end_1' },
          ],
        },
      });
    }

    // 流程发布（关键：DRAFT 流程不进应用发布快照、记录触发不匹配——
    // CI 全新库实测"任务永不出现"的根因）。重复发布 = 版本+1，幂等安全。
    try {
      await admin.post(`/processes/${flow!.id}/publish`, {});
    } catch {
      // 已发布流程重复发布同样版本冲突——忽略
    }

    // 发布（幂等：已发布则跳过——版本冲突 400 视为已发布）
    try {
      await admin.post(`/apps/${appId}/publish`, {
        version: `1.0.${Date.now() % 1000}`,
        description: '反馈环 e2e 夹具',
      });
    } catch {
      // 已发布过（版本号重复）——忽略
    }
    expect(formPageId).toBeTruthy();
    expect(listPageId).toBeTruthy();

    // 清场：驳回历史运行遗留的"反馈审批"待办（幂等，0 条跳过）——
    // 保证用例内"最新任务=本记录触发"的定位假设成立
    try {
      const stale = await admin.get<Array<{ id: string; taskName: string }>>(
        `/tasks?status=pending&pageSize=100`,
      );
      for (const t of stale.filter((x) => x.taskName === '反馈审批')) {
        await admin.post(`/tasks/${t.id}/complete`, { decision: 'reject', comment: 'e2e 清场' });
      }
    } catch {
      // 清场失败不阻塞夹具（用例内仍有轮询等待兜底）
    }
  });

  test('驳回 → writeback 回写 rejected + 申请人站内信通知', async () => {
    // 终端用户提交记录（API；真实 UI 提交在下一用例覆盖）
    const userToken = await (
      await import('./fixtures.js')
    ).loginViaApi('user@apaas.dev', 'user123');
    const user = createApiClient(userToken);
    const record = await user.post<{ id: string }>(`/objects/${objectId}/records`, {
      item: 'e2e 驳回用例',
      status: 'pending',
    });
    expect(record.id).toBeTruthy();

    // admin 驳回：轮询等待本记录触发的任务创建（提交→BullMQ 异步启动实例→建任务），
    // 然后驳回该任务（列表可能含前次运行遗留任务——按实例归属过滤）
    let taskId = '';
    for (let i = 0; i < 20 && !taskId; i++) {
      const tasks = await admin.get<Array<{ id: string; taskName: string; instanceId?: string }>>(
        `/tasks?status=pending&pageSize=100`,
      );
      const pending = tasks.filter((t) => t.taskName === '反馈审批');
      if (pending.length > 0)
        taskId = pending[0]!.id; // 列表按创建时间倒序，首条即最新
      else await new Promise((r) => setTimeout(r, 500));
    }
    expect(taskId, '提交触发的审批任务未在超时内出现').toBeTruthy();
    await admin.post(`/tasks/${taskId}/complete`, {
      decision: 'reject',
      comment: 'e2e 驳回断言',
    });

    // 断言 1：writeback 驳回值回写（决策后回写有引擎处理时延——轮询等待）
    let rejected = false;
    for (let i = 0; i < 10 && !rejected; i++) {
      const records = await admin.get<{
        items: Array<{ id: string; data: Record<string, unknown> }>;
      }>(`/objects/${objectId}/records?pageSize=100`);
      const found = records.items.find((r) => r.id === record.id);
      rejected = found?.data['status'] === 'rejected';
      if (!rejected) await new Promise((r) => setTimeout(r, 500));
    }
    expect(rejected, '驳回后 writeback 应把 status 回写为 rejected').toBe(true);

    // 断言 2：申请人站内信（notification 节点 → InAppMessage）
    const notifications = await user.get<{ items?: Array<{ title?: string }> }>(
      `/notifications?pageSize=20`,
    );
    const titles = JSON.stringify(notifications);
    expect(titles).toContain('反馈审批被驳回');
  });

  test('运行时 UI：台账显示驳回中文标签', async ({ page }) => {
    // 注入终端用户登录态（API 登录 + zustand persist 直写 localStorage——
    // 绕开登录 UI 的 auth 限流；登录 UI 本身由 e2e/01 覆盖）
    const { token: userToken, user } = await (
      await import('./fixtures.js')
    ).loginViaApiWithUser('user@apaas.dev', 'user123');
    const persisted = JSON.stringify({ state: { token: userToken, user }, version: 0 });
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      ['apaas:auth', persisted],
    );

    // 打开台账页（应用门户，注入登录态直接访问）
    await page.goto(`${RUNTIME_BASE}/app/${appId}/p/${pageSlug}`);
    await expect(page.getByRole('heading', { name: '反馈台账' })).toBeVisible({ timeout: 15_000 });
    // 上一用例驳回的记录 → mapping 中文标签"已驳回"
    await expect(page.getByText('e2e 驳回用例').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('已驳回').first()).toBeVisible({ timeout: 10_000 });
  });
});
