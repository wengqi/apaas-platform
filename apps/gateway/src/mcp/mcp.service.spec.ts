/**
 * McpService 单测（G4）——AI 写路径的治理不变量。
 *
 * 核心断言：
 * 1. 校验闸：非法 schema 被拒且返回结构化 issues（agent 自修正输入）
 * 2. 草稿不变量：submit_* 只创建/更新草稿，绝不触碰发布状态
 * 3. 流程草稿的 pageId 跨引用校验（引用不存在的审批页面 → 拒绝）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpService } from './mcp.service.js';
import { SchemaContractService } from '../schema-contract/schema-contract.service.js';
import { PageService } from '../page/page.service.js';
import { ProcessService } from '../process/process.service.js';
import { ObjectService } from '../object/object.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

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

function makeService() {
  const prisma = getMockPrisma();
  const pageService = {
    create: vi.fn().mockResolvedValue({ id: 'page-new', isPublished: false }),
    update: vi.fn().mockResolvedValue({ id: 'page-1', isPublished: false }),
    list: vi.fn().mockResolvedValue([{ id: 'page-real' }]),
    get: vi.fn(),
  };
  const processService = {
    createProcess: vi.fn().mockResolvedValue({ id: 'proc-new', status: 'DRAFT' }),
    updateProcess: vi.fn().mockResolvedValue({ id: 'proc-1', status: 'DRAFT' }),
    listProcesses: vi.fn().mockResolvedValue([]),
    getProcess: vi.fn(),
  };
  const objectService = {
    create: vi.fn().mockResolvedValue({
      id: 'obj-new',
      fields: [{ id: 'f0', apiName: 'created_by', isSystem: true }],
    }),
  };
  const svc = new McpService(
    new SchemaContractService(),
    pageService as unknown as PageService,
    processService as unknown as ProcessService,
    objectService as unknown as ObjectService,
  );
  return { svc, prisma, pageService, processService, objectService };
}

describe('MCP 校验闸（G3 前置）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validate_schema：非法 schema 返回 issues 且 ok=false', async () => {
    const r = await new McpService(
      new SchemaContractService(),
      {} as PageService,
      {} as ProcessService,
      {} as ObjectService,
    ).validateSchema('t1', 'amis_page', invalidPageSchema);
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => i.code === 'TYPE_FORBIDDEN')).toBe(true);
  });

  it('validate_schema：合法 schema 通过', async () => {
    const r = await new McpService(
      new SchemaContractService(),
      {} as PageService,
      {} as ProcessService,
      {} as ObjectService,
    ).validateSchema('t1', 'amis_page', validPageSchema);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });
});

describe('MCP 页面草稿（submit_page_draft）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('合法 schema → 创建草稿（isPublished 恒为 false 语义）', async () => {
    const { svc, pageService } = makeService();
    const r = await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_form_v2',
      name: '合同提交页',
      schema: validPageSchema,
      type: 'form_page',
      objectId: 'obj-1',
    });
    expect(r.ok).toBe(true);
    expect(r.published).toBe(false);
    expect(pageService.create).toHaveBeenCalledWith(
      't1',
      'app-1',
      expect.objectContaining({ apiName: 'contract_form_v2', type: 'form_page' }),
      'mcp:ai-agent',
    );
  });

  it('非法 schema → 拒绝且不落库', async () => {
    const { svc, pageService } = makeService();
    const r = await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'bad_page',
      name: '坏页面',
      schema: invalidPageSchema,
    });
    expect(r.ok).toBe(false);
    expect(r.issues?.length).toBeGreaterThan(0);
    expect(pageService.create).not.toHaveBeenCalled();
    expect(pageService.update).not.toHaveBeenCalled();
  });

  it('传 pageId → 走更新路径', async () => {
    const { svc, pageService } = makeService();
    const r = await svc.submitPageDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_form',
      name: '合同提交页',
      schema: validPageSchema,
      pageId: 'page-1',
    });
    expect(r.action).toBe('updated');
    expect(pageService.update).toHaveBeenCalledWith(
      't1',
      'page-1',
      expect.objectContaining({ name: '合同提交页' }),
      'mcp:ai-agent',
    );
  });
});

describe('MCP 流程草稿（submit_workflow_draft）', () => {
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

  it('合法流程 → 创建 DRAFT', async () => {
    const { svc, processService } = makeService();
    const r = await svc.submitWorkflowDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract_flow',
      name: '合同审批流',
      workflowSchema: validWorkflow,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('DRAFT');
    expect(processService.createProcess).toHaveBeenCalled();
  });

  it('pageId 引用不存在的页面 → 拒绝（跨引用校验）', async () => {
    const { svc, processService } = makeService();
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
    expect(processService.createProcess).not.toHaveBeenCalled();
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

describe('MCP 对象草稿（submit_object_draft）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.objectMeta.findFirst.mockResolvedValue(null);
    prisma.objectMeta.update.mockResolvedValue({});
  });

  const validFields = [
    { apiName: 'contract_name', label: '合同名称', type: 'text', config: { maxLength: 150 } },
    { apiName: 'amount', label: '金额', type: 'currency', config: { number: { precision: 2 } } },
  ];

  it('合法字段 → 创建对象并合并系统字段', async () => {
    const { svc, objectService } = makeService();
    const r = await svc.submitObjectDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract',
      name: '采购合同',
      fields: validFields,
    });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('created');
    expect(objectService.create).toHaveBeenCalled();
    // 合并后 = 系统字段 + 业务字段
    const merged = prisma.objectMeta.update.mock.calls[0]![0] as {
      data: { fields: Array<{ apiName?: string; isSystem?: boolean }> };
    };
    expect(merged.data.fields.some((f) => f.isSystem === true)).toBe(true);
    expect(merged.data.fields.some((f) => f.apiName === 'amount')).toBe(true);
  });

  it('更新已存在对象 → 保留系统字段、替换业务字段', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue({
      id: 'obj-1',
      fields: [
        { id: 'f0', apiName: 'created_by', label: '创建人', type: 'user', isSystem: true },
        { apiName: 'old_field', label: '旧字段', type: 'text', isSystem: false },
      ],
    });
    const { svc } = makeService();
    const r = await svc.submitObjectDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'contract',
      name: '采购合同',
      fields: validFields,
    });
    expect(r.action).toBe('updated');
    const merged = prisma.objectMeta.update.mock.calls[0]![0] as {
      data: { fields: Array<{ apiName: string; isSystem?: boolean }> };
    };
    expect(merged.data.fields.some((f) => f.apiName === 'created_by' && f.isSystem)).toBe(true);
    expect(merged.data.fields.some((f) => f.apiName === 'old_field')).toBe(false);
    expect(merged.data.fields.some((f) => f.apiName === 'amount')).toBe(true);
  });

  it('非法字段类型 → 拒绝且不落库', async () => {
    const { svc, objectService } = makeService();
    const r = await svc.submitObjectDraft('t1', 'ai-agent', {
      appId: 'app-1',
      apiName: 'bad_obj',
      name: '坏对象',
      fields: [{ apiName: 'x', label: 'X', type: 'quantum_field', config: {} }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues?.some((i) => i.code === 'UNKNOWN_TYPE')).toBe(true);
    expect(objectService.create).not.toHaveBeenCalled();
  });
});
