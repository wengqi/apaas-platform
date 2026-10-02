/**
 * E2E 测试 — R1.5 验收应用刷新：采购合同应用走通 P1 全链路协同。
 *
 * 蓝图完整回合（DESIGN-refactor-blueprint §AI 生成层）在真实验收应用上的落地：
 *   AI 出稿（MCP+G3）→ 审核中心人批（R1.2 diff 快审）→ 应用发布（挂 prod 指针）
 *   → runtime 环境读取（R1.4）→ G4 环境变量 → 开放 API 触发真实审批流
 *   （G6+R1.3：会签/依次/页面绑定/状态回写）→ 钉版本稳定性。
 *
 * 17/18/19 各自验证单点能力；本 spec 验证跨能力协同——procurement 应用
 * 自此从 seed 直写快照的旧路径迁入环境指针时代。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi } from './fixtures.js';

const API_BASE = 'http://localhost:3000/api/v1';

test.describe('R1.5 验收刷新：P1 全链路协同', () => {
  let api: ReturnType<typeof createApiClient>;
  let builderApi: ReturnType<typeof createApiClient>;
  let appId = '';
  let contractObjId = '';
  let approvalPageId = '';
  let adminUserId = '';
  let cfoUserId = '';
  let apiKey = '';
  let openFlowId = '';

  const statsPageApiName = `contract_stats_${Date.now()}`;
  const openFlowApiName = `contract_open_flow_${Date.now()}`;

  /** MCP JSON-RPC 工具调用（JWT 身份出稿）。 */
  async function mcpCall(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${API_BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${api.token}`,
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

  /** 开放端点调用（X-API-Key）。 */
  async function openCall(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${API_BASE}/open${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  /** slug 读取（运行时环境读路径）。 */
  async function readSlug(
    env: 'prod' | 'dev',
    slug: string,
  ): Promise<{ schema?: { title?: string } } | null> {
    const res = await fetch(`${API_BASE}/apps/${appId}/pages/slug/${slug}?env=${env}`, {
      headers: { Authorization: `Bearer ${api.token}` },
    });
    const json = (await res.json()) as { ok: boolean; data?: { schema?: { title?: string } } };
    return json.ok ? (json.data ?? null) : null;
  }

  /** 等待指定实例的全部待审任务（合并 admin+builder 视角）。 */
  async function waitForTasks(
    instanceId: string,
  ): Promise<Array<{ id: string; assignee: string | null }>> {
    for (let i = 0; i < 20; i += 1) {
      const adminTasks = await api.get<
        Array<{ id: string; instanceId: string; assignee: string | null }>
      >(`/tasks?status=pending&pageSize=50`);
      const builderTasks = await builderApi.get<
        Array<{ id: string; instanceId: string; assignee: string | null }>
      >(`/tasks?status=pending&pageSize=50`);
      const merged = [...adminTasks, ...builderTasks].filter((t) => t.instanceId === instanceId);
      const seen = new Set<string>();
      const unique = merged.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
      if (unique.length > 0) return unique;
      await new Promise((r) => setTimeout(r, 500));
    }
    return [];
  }

  test.beforeAll(async () => {
    api = createApiClient(await loginViaApi());
    builderApi = createApiClient(await loginViaApi('builder@apaas.dev', 'builder123'));

    // 采购 seed 应用与关键资源
    const apps = await api.get<Array<{ id: string; apiName: string }>>('/apps');
    appId = apps.find((a) => a.apiName === 'procurement')!.id;

    const objects = await api.get<Array<{ id: string; apiName: string }>>(`/apps/${appId}/objects`);
    contractObjId = objects.find((o) => o.apiName === 'contract')!.id;

    const pages = await api.get<Array<{ id: string; apiName?: string; slug?: string }>>(
      `/apps/${appId}/pages`,
    );
    approvalPageId = pages.find((p) => (p.apiName ?? p.slug) === 'contract_approval_page')!.id;

    // 审批人 id：从既有 contract_approval 流程的冻结 schema 提取（countersign approveUsers + sequential assignee）
    const processes = await api.get<Array<{ id: string; apiName: string }>>(
      `/apps/${appId}/processes`,
    );
    const seededFlow = await api.get<{
      workflowSchema: {
        nodes: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
      };
    }>(`/processes/${processes.find((p) => p.apiName === 'contract_approval')!.id}`);
    const countersign = seededFlow.workflowSchema.nodes.find(
      (n) => n.id === 'user_task_countersign',
    );
    const minor = seededFlow.workflowSchema.nodes.find((n) => n.id === 'user_task_minor');
    // seed 语义：single 节点 assignee=admin；countersign approveUsers=[admin, 第二审批人]
    adminUserId = (minor?.data?.['assignee'] as string) ?? '';
    cfoUserId =
      ((countersign?.data?.['approveUsers'] as string[]) ?? []).find((u) => u !== adminUserId) ??
      adminUserId;
    expect(adminUserId).toBeTruthy();
    expect(cfoUserId).not.toBe(adminUserId);
  });

  // 验收产生的资源随应用版本留痕（procurement 是长期验收应用，不做 afterAll 清理）

  // =========================================================================
  // ① AI 出稿（G4 MCP + G3 校验闸 + R1.2 治理轨道）
  // =========================================================================

  test('① validate_schema dry-run 通过 + submit_page_draft 进入待审（不落活表）', async () => {
    const schema = {
      type: 'page',
      title: '${env.STATS_TITLE}',
      body: [
        {
          type: 'form',
          title: '合同统计',
          api: { url: `/api/v1/apps/${appId}/datasets/chart-data`, method: 'post' },
          body: [
            { type: 'input-number', name: 'amount', label: '金额（万元）', kilobitSeparator: true },
            {
              type: 'select',
              name: 'status',
              label: '状态',
              options: [
                { label: '待审批', value: 'PENDING' },
                { label: '已通过', value: 'APPROVED' },
                { label: '已驳回', value: 'REJECTED' },
              ],
            },
          ],
        },
      ],
    };

    // G3 dry-run（agent 提交前自检——蓝图回路的 validate 步）
    const validated = await mcpCall('validate_schema', { kind: 'amis_page', schema });
    expect(validated['ok']).toBe(true);

    // 提交（绑定 contract 对象真实字段语境）→ PENDING 待审
    const submit = await mcpCall('submit_page_draft', {
      appId,
      apiName: statsPageApiName,
      name: '合同统计看板',
      type: 'dashboard',
      objectId: contractObjId,
      schema,
    });
    expect(submit['ok']).toBe(true);
    expect(submit['status']).toBe('PENDING');

    // 治理不变量：批准前不落活表
    const pages = await api.get<Array<{ apiName: string }>>(`/apps/${appId}/pages`);
    expect(pages.some((p) => p.apiName === statsPageApiName)).toBe(false);
  });

  // =========================================================================
  // ② 审核中心 diff 快审（G1 验收项）
  // =========================================================================

  test('② 待审列表含 diff 摘要 → 一键批准 → 页面落活表', async () => {
    const pending = await api.get<
      Array<{ apiName: string; status: string; diff: { changeCount: number }; id: string }>
    >(`/apps/${appId}/reviews?status=PENDING`);
    const submission = pending.find((r) => r.apiName === statsPageApiName);
    expect(submission).toBeTruthy();
    expect(submission!.diff.changeCount).toBeGreaterThan(0);

    await api.post(`/apps/${appId}/reviews/${submission!.id}/approve`, { comment: '验收通过' });

    const pages = await api.get<Array<{ apiName?: string; slug?: string }>>(`/apps/${appId}/pages`);
    expect(pages.some((p) => (p.apiName ?? p.slug) === statsPageApiName)).toBe(true);
  });

  // =========================================================================
  // ③ 发布入指针时代（R1.4）——procurement 首次走真实发布流
  // =========================================================================

  test('③ 定义必填变量+设 prod 值 → publish 挂 prod 指针 → runtime ?env=prod 读到新页（经 bundle 替换）', async () => {
    // 定义必填 STATS_TITLE（幂等：已存在则复用）+ 设 prod 值——G4 要求发布前必填齐备
    const existing = await api.get<{
      defs: Array<{ id: string; key: string; required: boolean }>;
      values: Array<{ defId: string; isSet: boolean }>;
    }>(`/apps/${appId}/env-vars?env=prod`);
    const existingDef = existing.defs.find((d) => d.key === 'STATS_TITLE');
    const def = existingDef
      ? existingDef
      : await api.post<{ id: string }>(`/apps/${appId}/env-vars/defs`, {
          key: 'STATS_TITLE',
          description: '合同统计看板标题',
          required: true,
          sensitive: false,
        });
    await api.post(`/apps/${appId}/env-vars/defs/${def.id}/value?env=prod`, {
      value: '生产·合同统计看板',
    });

    // 自愈：历史 run 遗留的必填键若缺 prod 值会卡住 G4 预检——统一补占位值
    for (const d of existing.defs) {
      const isSet = existing.values.some((v) => v.defId === d.id && v.isSet);
      if (d.required && !isSet) {
        await api.post(`/apps/${appId}/env-vars/defs/${d.id}/value?env=prod`, {
          value: 'acceptance',
        });
      }
    }

    // 版本号碰撞安全：宽空间 + 409 重试（跨 run 幂等）
    let version: { id: string; versionNumber: string } | null = null;
    for (let attempt = 0; attempt < 5 && !version; attempt += 1) {
      const candidate = `2.0.${(Date.now() + attempt * 7) % 1000000}`;
      try {
        version = await api.post<{ id: string; versionNumber: string }>(`/apps/${appId}/publish`, {
          version: candidate,
          description: 'R1.5 验收刷新：MCP 出稿页面随应用发布',
        });
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('已存在')) throw err;
      }
    }
    expect(version).not.toBeNull();
    expect(version!.versionNumber).toBeTruthy();

    const envs = await api.get<Array<{ key: string; currentVersionNumber: string | null }>>(
      `/apps/${appId}/environments`,
    );
    expect(envs.find((e) => e.key === 'prod')?.currentVersionNumber).toBe(version.versionNumber);

    // 全链路证明：MCP 出稿 → 人批 → 随应用发布 → 环境指针 → 运行时 bundle 替换可读
    const page = await readSlug('prod', statsPageApiName);
    expect(page).not.toBeNull();
    expect(page!.schema?.title).toBe('生产·合同统计看板');
  });

  // =========================================================================
  // ④ G4 环境变量闸门与 per-env 值（R1.4）
  // =========================================================================

  test('④ G4：新增必填变量未设 dev 值 → 拦截部署 → 设值放行', async () => {
    // 每次运行唯一的必填键（阻断场景要求该键在 dev 无值）
    const blockKey = `E2E_BLOCK_${Date.now()}`;
    const def = await api.post<{ id: string }>(`/apps/${appId}/env-vars/defs`, {
      key: blockKey,
      description: 'G4 阻断验证',
      required: true,
      sensitive: false,
    });

    // dev 无值 → G4 拦截部署
    const envsNow = await api.get<Array<{ key: string; currentVersionId: string | null }>>(
      `/apps/${appId}/environments`,
    );
    const currentVersionId = envsNow.find((e) => e.key === 'prod')!.currentVersionId!;

    const blocked = await fetch(`${API_BASE}/apps/${appId}/environments/dev/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token}` },
      body: JSON.stringify({ versionId: currentVersionId }),
    });
    expect(blocked.status).toBe(400);
    const blockedJson = (await blocked.json()) as { error?: { message?: string } };
    expect(blockedJson.error?.message).toContain(blockKey);

    // 设 dev 值 → 放行
    await api.post(`/apps/${appId}/env-vars/defs/${def.id}/value?env=dev`, { value: 'v' });
    const deploy = await api.post<{ deployment: { versionNumber: string } }>(
      `/apps/${appId}/environments/dev/publish`,
      { versionId: currentVersionId },
    );
    expect(deploy.deployment.versionNumber).toBeTruthy();

    // prod 也补值：必填键缺 prod 值会卡住后续 run 的应用发布预检（G4）
    await api.post(`/apps/${appId}/env-vars/defs/${def.id}/value?env=prod`, { value: 'v' });
  });

  // =========================================================================
  // ⑤ 开放 API：MCP 出稿 API 触发流（真实 pageId 跨引用）→ 人批 → 发布为 API
  // =========================================================================

  test('⑤ submit_workflow_draft（API 触发+真实 pageId 过 G3）→ 批准落 DRAFT → 发布流程 → api-release + 服务身份', async () => {
    const workflowSchema = {
      nodes: [
        {
          id: 's',
          type: 'start',
          meta: { position: { x: 80, y: 240 } },
          data: {
            title: '开始',
            inputsValues: { recordId: { type: 'ref', content: ['recordId'] } },
          },
        },
        {
          id: 'ut_cs',
          type: 'user_task',
          meta: { position: { x: 320, y: 240 } },
          data: {
            taskName: '开放会签',
            approvalMode: 'countersign',
            approveUsers: [adminUserId, cfoUserId],
            pageId: approvalPageId, // 真实页面 ID——G3 跨引用
          },
        },
        {
          id: 'ut_final',
          type: 'user_task',
          meta: { position: { x: 560, y: 240 } },
          data: {
            taskName: '开放终审',
            approvalMode: 'sequential',
            approveUsers: [adminUserId],
            pageId: approvalPageId,
          },
        },
        {
          id: 'cond',
          type: 'condition',
          meta: { position: { x: 800, y: 240 } },
          data: { title: '审批结果分支' },
        },
        {
          id: 'op_ok',
          type: 'object_operation',
          meta: { position: { x: 1040, y: 140 } },
          data: {
            title: '合同状态置为已批准',
            operation: 'update',
            objectId: contractObjId,
            inputsValues: {
              recordId: { type: 'ref', content: ['recordId'] },
              status: { type: 'constant', content: 'APPROVED' },
            },
          },
        },
        { id: 'e', type: 'end', meta: { position: { x: 1280, y: 240 } }, data: {} },
      ],
      edges: [
        { sourceNodeID: 's', targetNodeID: 'ut_cs' },
        { sourceNodeID: 'ut_cs', targetNodeID: 'ut_final' },
        { sourceNodeID: 'ut_final', targetNodeID: 'cond' },
        {
          sourceNodeID: 'cond',
          targetNodeID: 'op_ok',
          label: 'APPROVED',
          condition: '{"==":[{"var":"decision"},"APPROVED"]}',
        },
        { sourceNodeID: 'op_ok', targetNodeID: 'e' },
      ],
    };

    const submit = await mcpCall('submit_workflow_draft', {
      appId,
      apiName: openFlowApiName,
      name: '开放合同审批流',
      triggerType: 'API',
      workflowSchema,
    });
    expect(submit['ok']).toBe(true);
    expect(submit['status']).toBe('PENDING');

    // 审核中心批准 → 以 DRAFT 落活表（激活仍走流程发布）
    const pending = await api.get<Array<{ apiName: string; id: string }>>(
      `/apps/${appId}/reviews?status=PENDING`,
    );
    const submission = pending.find((r) => r.apiName === openFlowApiName);
    expect(submission).toBeTruthy();
    await api.post(`/apps/${appId}/reviews/${submission!.id}/approve`, {});

    const processes = await api.get<Array<{ id: string; apiName: string; status: string }>>(
      `/apps/${appId}/processes`,
    );
    const flow = processes.find((p) => p.apiName === openFlowApiName)!;
    expect(flow.status).toBe('DRAFT');
    openFlowId = flow.id;

    await api.post(`/processes/${flow.id}/publish`);

    // 发布为开放 API（major1 冻结契约）+ 服务身份
    await api.post(`/apps/${appId}/processes/${flow.id}/api-release`, { majorVersion: 1 });
    const identity = await api.post<{ apiKey: string }>(`/apps/${appId}/service-identities`, {
      name: 'R1.5 验收集成',
    });
    apiKey = identity.apiKey;
    expect(apiKey).toMatch(/^ak_/);
  });

  // =========================================================================
  // ⑥ 外部触发 → 人工审批 → 业务数据回写（G6+R1.3 闭环）
  // =========================================================================

  test('⑥ X-API-Key 触发（128万走会签）→ 双人会签 → 终审 → COMPLETED → 合同状态回写 APPROVED', async () => {
    // 造一条合同记录（待审批态），开放触发时把 recordId 喂给流程
    const record = await api.post<{ id: string; data: Record<string, unknown> }>(
      `/objects/${contractObjId}/records`,
      {
        contract_name: 'R1.5 开放触发合同',
        supplier_name: '外部系统供应商',
        amount: 1280000,
        status: 'PENDING',
      },
    );

    const started = await openCall('POST', `/apps/${appId}/processes/${openFlowApiName}/start`, {
      inputs: { recordId: record.id, contract_name: 'R1.5 开放触发合同', amount: 1280000 },
      triggeredByUser: 'ERP-INT-001',
    });
    expect(started.status).toBe(201);
    const instanceId = (started.json.data as { instanceId: string }).instanceId;

    // 会签：两任务并行，单独完成不推进（R1.3 锁内并发封窗语义）
    const csTasks = await waitForTasks(instanceId);
    expect(csTasks.length).toBe(2);
    const adminTask = csTasks.find((t) => t.assignee === adminUserId)!;
    const cfoTask = csTasks.find((t) => t.assignee !== adminUserId)!;
    await api.post(`/tasks/${adminTask.id}/complete`, { decision: 'approve', comment: '会签通过' });
    const still = await waitForTasks(instanceId);
    expect(still.map((t) => t.id)).toContain(cfoTask.id); // 未全部通过不推进
    await builderApi.post(`/tasks/${cfoTask.id}/complete`, {
      decision: 'approve',
      comment: '会签通过',
    });

    // 依次终审（admin）
    const finalTasks = await waitForTasks(instanceId);
    expect(finalTasks.length).toBe(1);
    await api.post(`/tasks/${finalTasks[0]!.id}/complete`, {
      decision: 'approve',
      comment: '终审通过',
    });

    // 实例完成 + 合同状态被 object_operation 回写
    await expect
      .poll(
        async () => {
          const inst = await api.get<{ status: string }>(`/instances/${instanceId}`);
          return inst.status;
        },
        { timeout: 20_000 },
      )
      .toBe('COMPLETED');

    await expect
      .poll(
        async () => {
          const rec = await api.get<{ data: { status?: string } }>(`/records/${record.id}`);
          return rec.data?.status;
        },
        { timeout: 20_000 },
      )
      .toBe('APPROVED');
  });

  // =========================================================================
  // ⑦ 钉版本稳定性（G6 承诺在验收应用上的轻量验证）
  // =========================================================================

  test('⑦ 修改流程发 major2 后，major/1 钉版本仍可触发', async () => {
    // 复用 ⑤ 记录的流程 id（跨测试传递）
    expect(openFlowId).toBeTruthy();
    const flow = { id: openFlowId };

    // 修改 schema（任务改名）→ 重新发布 → major2
    const flowDetail = await api.get<{
      workflowSchema: { nodes: Array<{ id: string; data?: Record<string, unknown> }> };
    }>(`/processes/${flow.id}`);
    const node = flowDetail.workflowSchema.nodes.find((n) => n.id === 'ut_cs');
    if (node?.data) node.data['taskName'] = '开放会签（v2）';
    await api.put(`/processes/${flow.id}`, { workflowSchema: flowDetail.workflowSchema });
    await api.post(`/processes/${flow.id}/publish`);
    await api.post(`/apps/${appId}/processes/${flow.id}/api-release`, { majorVersion: 2 });

    const record = await api.post<{ id: string }>(`/objects/${contractObjId}/records`, {
      contract_name: 'R1.5 v1 钉版本合同',
      supplier_name: '钉版本供应商',
      amount: 300000,
      status: 'PENDING',
    });

    // 钉 major1（DEPRECATED 仍可调）：小额虽走不到会签（amount<100万边条件在 v1 并不存在——
    // v1 无金额分支，直接会签），验证点 = 钉版本可启动且 major 返回 1
    const pinned = await openCall(
      'POST',
      `/apps/${appId}/processes/${openFlowApiName}/major/1/start`,
      { inputs: { recordId: record.id, amount: 300000 } },
    );
    expect(pinned.status).toBe(201);
    expect((pinned.json.data as { majorVersion: number }).majorVersion).toBe(1);
  });
});
