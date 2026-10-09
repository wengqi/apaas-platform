/**
 * McpService 单测（G4 + R1.2 治理轨道接入）——AI 写路径的治理不变量。
 *
 * 核心断言：
 * 1. 校验闸：非法 schema 被拒且返回结构化 issues（agent 自修正输入）
 * 2. 待审不变量：submit_* 一律进 R1.2 待审队列（PENDING），绝不直写活表
 * 3. 流程草稿的 pageId 跨引用校验（引用不存在的审批页面 → 拒绝）
 * 4. 治理查询：list_review_submissions 透传审批状态与驳回意见
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpService } from './mcp.service.js';
import { SchemaContractService } from '../schema-contract/schema-contract.service.js';
import { PageService } from '../page/page.service.js';
import { ProcessService } from '../process/process.service.js';
import { ObjectService } from '../object/object.service.js';
import { ReviewService } from '../review/review.service.js';
import { ApplicationService } from '../application/application.service.js';
import { ObservabilityService } from '../observability/observability.service.js';
import { requireParams } from './mcp-server.factory.js';
import { getMockPrisma } from '../test/test-helpers.js';
import type { ResourceVersionListItemDto } from '@apaas/shared';

/** 合法的 amis 页面 schema（审批页同构）。 */
const validPageSchema = {
  type: 'page',
  title: '采购合同提交',
  body: [
    {
      type: 'form',
      body: [
        { type: 'input-text', name: 'contract_name', label: '合同名称', required: true },
        { type: 'input-number', name: 'amount', label: '金额' },
      ],
    },
  ],
};

/** 非法页面 schema（未知类型——校验闸必须拦下）。 */
const invalidPageSchema = {
  type: 'page',
  body: [{ type: 'input-cascader', name: 'region', label: '地区' }],
};

function makePendingDto(
  overrides?: Partial<ResourceVersionListItemDto>,
): ResourceVersionListItemDto {
  return {
    id: 'sub-1',
    appId: 'app-1',
    module: 'PAGE',
    entityId: null,
    apiName: 'contract_form_v2',
    name: '合同提交页',
    versionNumber: 1,
    status: 'PENDING',
    source: 'AI_MCP',
    submittedBy: 'ai-agent',
    submittedVia: 'mcp',
    baselineVersionId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    batchId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    diff: { changeCount: 1, summary: '新增 1 · 修改 0 · 删除 0', items: [] },
    ...overrides,
  };
}

function makeService() {
  const reviewService = {
    submitAiDraft: vi
      .fn()
      .mockImplementation(
        async (
          _tenantId: string,
          input: { module: string; apiName: string; name: string; entityId?: string },
        ) =>
          makePendingDto({
            module: input.module as ResourceVersionListItemDto['module'],
            apiName: input.apiName,
            name: input.name,
            entityId: input.entityId ?? null,
          }),
      ),
    listSubmissions: vi.fn().mockResolvedValue([makePendingDto()]),
  };
  const pageService = {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn().mockResolvedValue([{ id: 'page-real' }]),
    get: vi.fn(),
  };
  const processService = {
    createProcess: vi.fn(),
    updateProcess: vi.fn(),
    listProcesses: vi.fn().mockResolvedValue([]),
    getProcess: vi.fn(),
  };
  const objectService = {
    create: vi.fn(),
  };
  const applicationService = {
    create: vi.fn().mockResolvedValue({
      id: 'app-new',
      apiName: 'leave_mgmt',
      name: '请假管理',
      status: 'DRAFT',
    }),
  };
  const observability = { record: vi.fn().mockResolvedValue(undefined) };
  const svc = new McpService(
    new SchemaContractService(),
    pageService as unknown as PageService,
    processService as unknown as ProcessService,
    objectService as unknown as ObjectService,
    reviewService as unknown as ReviewService,
    applicationService as unknown as ApplicationService,
    observability as unknown as ObservabilityService,
  );
  return {
    svc,
    reviewService,
    pageService,
    processService,
    objectService,
    applicationService,
    observability,
  };
}

describe('MCP 校验闸（G3 前置）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validate_schema：非法 schema 返回 issues 且 ok=false', async () => {
    const { svc } = makeService();
    const r = await svc.validateSchema('t1', 'amis_page', invalidPageSchema);
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => i.code === 'TYPE_FORBIDDEN')).toBe(true);
  });

  it('validate_schema：合法 schema 通过', async () => {
    const { svc } = makeService();
    const r = await svc.validateSchema('t1', 'amis_page', validPageSchema);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });
});

describe('MCP 页面提交（submit_page_draft → 待审）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('合法 schema → 进入待审队列（PENDING，不落活表）', async () => {
    const { svc, reviewService, pageService } = makeService();
    const r = await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_form_v2',
      name: '合同提交页',
      schema: validPageSchema,
      type: 'form_page',
      objectId: 'obj-1',
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('PENDING');
    expect(r.submissionId).toBe('sub-1');
    expect(r.published).toBe(false);
    expect(reviewService.submitAiDraft).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        module: 'PAGE',
        appId: 'app-1',
        apiName: 'contract_form_v2',
        snapshot: expect.objectContaining({ type: 'form_page', objectId: 'obj-1' }),
      }),
      'ai-agent',
    );
    // 治理不变量：提交不直写活表
    expect(pageService.create).not.toHaveBeenCalled();
    expect(pageService.update).not.toHaveBeenCalled();
  });

  it('非法 schema → 拒绝且不进待审队列', async () => {
    const { svc, reviewService } = makeService();
    const r = await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'bad_page',
      name: '坏页面',
      schema: invalidPageSchema,
    });
    expect(r.ok).toBe(false);
    expect(r.issues?.length).toBeGreaterThan(0);
    expect(reviewService.submitAiDraft).not.toHaveBeenCalled();
  });

  it('传 pageId → 更新语义（entityId 透传）', async () => {
    const { svc, reviewService } = makeService();
    const r = await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_form',
      name: '合同提交页',
      schema: validPageSchema,
      pageId: 'page-1',
    });
    expect(r.action).toBe('submitted_update');
    expect(reviewService.submitAiDraft).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ entityId: 'page-1' }),
      'ai-agent',
    );
  });
});

describe('MCP 流程提交（submit_workflow_draft → 待审）', () => {
  beforeEach(() => vi.clearAllMocks());

  const validWorkflow = {
    nodes: [
      { id: 's', type: 'start', data: {} },
      {
        id: 'ut',
        type: 'user_task',
        data: { taskName: '审批', approvalMode: 'single', assignee: 'u1', pageId: 'page-real' },
      },
      { id: 'e', type: 'end', data: {} },
    ],
    edges: [
      { sourceNodeID: 's', targetNodeID: 'ut' },
      { sourceNodeID: 'ut', targetNodeID: 'e' },
    ],
  };

  it('合法流程 → 进入待审队列', async () => {
    const { svc, reviewService, processService } = makeService();
    const r = await svc.submitWorkflowDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_flow',
      name: '合同审批流',
      workflowSchema: validWorkflow,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('PENDING');
    expect(reviewService.submitAiDraft).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ module: 'PROCESS', apiName: 'contract_flow' }),
      'ai-agent',
    );
    expect(processService.createProcess).not.toHaveBeenCalled();
  });

  it('pageId 引用不存在的页面 → 拒绝（跨引用校验）', async () => {
    const { svc, reviewService } = makeService();
    const badWorkflow = {
      ...validWorkflow,
      nodes: [
        { id: 's', type: 'start', data: {} },
        {
          id: 'ut',
          type: 'user_task',
          data: { taskName: '审批', approvalMode: 'single', assignee: 'u1', pageId: 'page-ghost' },
        },
        { id: 'e', type: 'end', data: {} },
      ],
    };
    const r = await svc.submitWorkflowDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_flow',
      name: '合同审批流',
      workflowSchema: badWorkflow,
    });
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => i.message.includes('page-ghost'))).toBe(true);
    expect(reviewService.submitAiDraft).not.toHaveBeenCalled();
  });

  it('幽灵边（终点不存在）→ 拒绝', async () => {
    const { svc } = makeService();
    const ghostWorkflow = {
      nodes: [
        { id: 's', type: 'start', data: {} },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [
        { sourceNodeID: 's', targetNodeID: 'e' },
        { sourceNodeID: 's', targetNodeID: 'ghost-node' },
      ],
    };
    const r = await svc.submitWorkflowDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'ghost_flow',
      name: '幽灵流程',
      workflowSchema: ghostWorkflow,
    });
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => i.message.includes('幽灵边'))).toBe(true);
  });
});

describe('MCP 对象提交（submit_object_draft → 待审）', () => {
  beforeEach(() => vi.clearAllMocks());

  const validFields = [
    { apiName: 'contract_name', label: '合同名称', type: 'text', config: { maxLength: 150 } },
    { apiName: 'amount', label: '金额', type: 'currency', config: { number: { precision: 2 } } },
  ];

  it('合法字段 → 快照仅含业务字段，进入待审队列', async () => {
    const { svc, reviewService, objectService } = makeService();
    const r = await svc.submitObjectDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract',
      name: '采购合同',
      fields: validFields,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('PENDING');
    expect(reviewService.submitAiDraft).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        module: 'OBJECT',
        snapshot: expect.objectContaining({
          fields: expect.arrayContaining([expect.objectContaining({ apiName: 'amount' })]),
        }),
      }),
      'ai-agent',
    );
    expect(objectService.create).not.toHaveBeenCalled();
  });

  it('非法字段类型 → 拒绝且不进待审队列', async () => {
    const { svc, reviewService } = makeService();
    const r = await svc.submitObjectDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'bad_obj',
      name: '坏对象',
      fields: [{ apiName: 'x', label: 'X', type: 'quantum_field', config: {} }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => i.code === 'UNKNOWN_TYPE')).toBe(true);
    expect(reviewService.submitAiDraft).not.toHaveBeenCalled();
  });
});

describe('MCP 治理查询（list_review_submissions）', () => {
  it('透传提交单状态与驳回意见', async () => {
    const { svc, reviewService } = makeService();
    reviewService.listSubmissions.mockResolvedValue([
      makePendingDto({ status: 'REJECTED', reviewComment: '金额字段命名不符合规范' }),
    ]);
    const r = await svc.listReviewSubmissions('t1', 'app-1');
    expect(r.ok).toBe(true);
    const submissions = r.submissions as Array<{ status: string; reviewComment: string | null }>;
    expect(submissions[0]!.status).toBe('REJECTED');
    expect(submissions[0]!.reviewComment).toBe('金额字段命名不符合规范');
    expect(reviewService.listSubmissions).toHaveBeenCalledWith('t1', 'app-1');
  });
});

describe('MCP 创建应用（create_application → 容器操作即时生效）', () => {
  it('透传 ApplicationService.create 并返回 appId 与下一步 hint', async () => {
    const { svc, applicationService } = makeService();
    const r = await svc.createApplication('t1', 'ai-agent', {
      apiName: 'leave_mgmt',
      name: '请假管理',
      icon: '🌴',
    });
    expect(r.ok).toBe(true);
    expect(r.appId).toBe('app-new');
    expect(r.apiName).toBe('leave_mgmt');
    expect(typeof r.hint).toBe('string');
    expect(applicationService.create).toHaveBeenCalledWith('t1', 'ai-agent', {
      apiName: 'leave_mgmt',
      name: '请假管理',
      description: undefined,
      icon: '🌴',
      color: undefined,
    });
  });
});

describe('MCP 必填参数守卫（requireParams——静默空结果的防线）', () => {
  it('必填参数缺失 → 结构化错误而非空串下潜（list_review_submissions 无 appId）', () => {
    const r = requireParams('list_review_submissions', {});
    expect(r?.['ok']).toBe(false);
    expect(r?.['error']).toContain('appId');
  });

  it('必填参数为空白字符串 → 同样拦截', () => {
    const r = requireParams('list_objects', { appId: '   ' });
    expect(r?.['ok']).toBe(false);
    expect(r?.['error']).toContain('appId');
  });

  it('多参数部分缺失 → 错误信息列全缺失项', () => {
    const r = requireParams('submit_object_draft', { name: '只有名字' });
    expect(r?.['ok']).toBe(false);
    expect(String(r?.['error'])).toContain('appId');
    expect(String(r?.['error'])).toContain('apiName');
    expect(String(r?.['error'])).toContain('fields');
  });

  it('未知工具 → 列出全部可用工具名', () => {
    const r = requireParams('no_such_tool', {});
    expect(r?.['ok']).toBe(false);
    expect(String(r?.['hint'])).toContain('create_application');
  });

  it('参数齐全 → 放行（返回 undefined 交由 dispatch）', () => {
    const r = requireParams('create_application', { name: '请假管理' });
    expect(r).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 选人工具：list_users / list_roles（AI 自主配置审批人的数据源）
// ---------------------------------------------------------------------------

describe('MCP 选人工具（list_users / list_roles）', () => {
  it('list_users：输出 id/姓名/邮箱/角色编码，keyword 过滤', async () => {
    const { svc } = makeService();
    const r = await svc.listUsers('t1', 'builder');
    // listUsers 直查 prisma（mock 代理默认空数组）——这里断言走通且结构稳定
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.users)).toBe(true);
    expect(r.hint).toContain('assignee');
  });

  it('list_roles：输出含 hint 指明 candidateGroups 用角色 ID', async () => {
    const { svc } = makeService();
    const r = await svc.listRoles('t1', 'app-1');
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.roles)).toBe(true);
    expect(r.hint).toContain('candidateGroups');
    expect(r.hint).toContain('非编码');
  });
});

describe('MCP 数据流提交（submit_dataset_draft → 待审）', () => {
  /** 合法数据流草稿（单源聚合）。 */
  const validDatasetDraft = {
    appId: 'app-1',
    apiName: 'sales_by_region',
    name: '区域销售额',
    config: {
      sources: [{ objectId: '@ref:object:sales_order', alias: 'orders' }],
      aggregation: {
        groupBy: ['region'],
        metrics: [{ alias: 'total_amount', label: '金额合计', field: 'amount', function: 'sum' }],
      },
      outputFields: [
        { alias: 'region', label: '销售区域', source: 'orders.region', type: 'string' },
        { alias: 'total_amount', label: '金额合计', source: 'total_amount', type: 'number' },
      ],
    },
  };

  beforeEach(() => vi.clearAllMocks());

  it('合法 config → 进入待审队列（PENDING，module=DATASET）', async () => {
    const { svc, reviewService } = makeService();
    const r = await svc.submitDatasetDraft('t1', 'ai-agent', validDatasetDraft);
    expect(r.ok).toBe(true);
    expect(reviewService.submitAiDraft).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ module: 'DATASET', apiName: 'sales_by_region' }),
      'ai-agent',
    );
  });

  it('非法 config（输出列 source 引用不存在的别名）→ 校验拒绝并返回结构化 issues', async () => {
    const { svc, reviewService } = makeService();
    const draft = {
      ...validDatasetDraft,
      config: {
        ...validDatasetDraft.config,
        outputFields: [{ alias: 'region', label: '区域', source: 'ghost.region', type: 'string' }],
      },
    };
    const r = await svc.submitDatasetDraft('t1', 'ai-agent', draft);
    expect(r.ok).toBe(false);
    expect(reviewService.submitAiDraft).not.toHaveBeenCalled();
  });
});

describe('MCP 权限规则集提交（submit_permission_rule_draft → 待审）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('合法规则集 → 进入待审队列（PENDING，module=PERMISSION）', async () => {
    const { svc, reviewService } = makeService();
    const db = getMockPrisma();
    db.role.findFirst.mockResolvedValue({ id: 'role-1', code: 'END_USER', name: '终端用户' });
    db.pageMeta.findFirst.mockResolvedValue({ id: 'page-1' });
    const r = await svc.submitPermissionRuleDraft('t1', 'ai-agent', {
      appId: 'app-1',
      roleId: 'role-1',
      rules: [{ type: 'PAGE', action: 'VIEW', targetId: 'page-1' }],
    });
    expect(r.ok).toBe(true);
    expect(reviewService.submitAiDraft).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ module: 'PERMISSION', apiName: 'END_USER' }),
      'ai-agent',
    );
  });

  it('角色不存在 → 拒绝并提示 list_roles', async () => {
    const { svc } = makeService();
    const db = getMockPrisma();
    db.role.findFirst.mockResolvedValue(null);
    const r = await svc.submitPermissionRuleDraft('t1', 'ai-agent', {
      appId: 'app-1',
      roleId: 'ghost',
      rules: [],
    });
    expect(r.ok).toBe(false);
  });

  it('非法规则（未知维度）→ G3 校验拒绝', async () => {
    const { svc, reviewService } = makeService();
    const db = getMockPrisma();
    db.role.findFirst.mockResolvedValue({ id: 'role-1', code: 'END_USER', name: '终端用户' });
    const r = await svc.submitPermissionRuleDraft('t1', 'ai-agent', {
      appId: 'app-1',
      roleId: 'role-1',
      rules: [{ type: 'TENANT', action: 'VIEW', targetId: 'x' }],
    });
    expect(r.ok).toBe(false);
    expect(reviewService.submitAiDraft).not.toHaveBeenCalled();
  });
});

describe('AI 生成遥测（ADR-0004 决策 5）', () => {
  beforeEach(() => vi.clearAllMocks());

  /** 取 observability.record 收到的 AI_GENERATION 事件参数。 */
  function aiEvents(observability: { record: ReturnType<typeof vi.fn> }) {
    return observability.record.mock.calls
      .map((c) => c[0] as { category: string; source: string; detail: Record<string, unknown> })
      .filter((a) => a.category === 'AI_GENERATION');
  }

  it('G3 拒绝 → mcp:submit-rejected 事件（kind/issueCodes 结构化）', async () => {
    const { svc, observability } = makeService();
    await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'bad_page',
      name: '坏页面',
      schema: invalidPageSchema,
    });
    const events = aiEvents(observability);
    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe('mcp:submit-rejected');
    expect(events[0]!.detail).toMatchObject({
      flow: 'submit',
      kind: 'PAGE',
      apiName: 'bad_page',
      mode: 'single',
    });
    expect(events[0]!.detail.issueCodes).toContain('TYPE_FORBIDDEN');
  });

  it('提交进待审 → mcp:submit-accepted 事件（resourceId=提交单）', async () => {
    const { svc, observability } = makeService();
    await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_form_v2',
      name: '合同提交页',
      schema: validPageSchema,
    });
    const events = aiEvents(observability);
    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe('mcp:submit-accepted');
    expect(events[0]!.detail).toMatchObject({
      flow: 'submit',
      kind: 'PAGE',
      apiName: 'contract_form_v2',
      mode: 'single',
    });
  });
});
