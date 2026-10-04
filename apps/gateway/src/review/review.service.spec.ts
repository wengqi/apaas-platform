/**
 * ReviewService 单测（R1.2 版本模型）——提交/审批状态机与治理不变量。
 *
 * 核心断言：
 * 1. 人工提交即时 APPROVED（基线快照，versionNumber 链内自增）
 * 2. AI 提交一律 PENDING + 同资源旧 PENDING 被 SUPERSEDED + 通知审核者
 * 3. 批准落活表（applySnapshot）；驳回必带意见并回传提交者
 * 4. 漂移保护：活表偏离提交基线时拒绝批准，force 放行
 * 5. 撤销未提交：无基线拒绝 / 干净免操作 / 脏则恢复基线
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReviewService, collectRefTokens, replaceRefTokens } from './review.service.js';
import { ReviewSnapshotService } from './review-snapshot.service.js';
import { InAppMessageService } from '../notification/in-app-message.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import type { ObjectResourceSnapshot } from '@apaas/shared';

const APP = 'app-1';
const TENANT = 't1';

const liveSnapshot: ObjectResourceSnapshot = {
  apiName: 'contract',
  name: '采购合同',
  fields: [{ apiName: 'amount', label: '金额', type: 'currency' }],
};

function makeRow(overrides?: Record<string, unknown>) {
  return {
    id: 'sub-1',
    appId: APP,
    module: 'OBJECT',
    entityId: 'obj-1',
    apiName: 'contract',
    name: '采购合同',
    versionNumber: 2,
    snapshot: liveSnapshot,
    status: 'PENDING',
    source: 'AI_MCP',
    submittedBy: 'ai-agent',
    submittedVia: 'mcp',
    baselineVersionId: 'base-1',
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

function makeService(live: ReturnType<typeof makeRow>['snapshot'] | null = liveSnapshot) {
  const prisma = getMockPrisma();
  const snapshotService = {
    extractLive: vi
      .fn()
      .mockImplementation(async (_t: string, _a: string, _m: string, id: string) =>
        live
          ? { entityId: id, apiName: liveSnapshot.apiName, name: liveSnapshot.name, snapshot: live }
          : null,
      ),
    applySnapshot: vi.fn().mockResolvedValue('obj-1'),
  };
  const inApp = { create: vi.fn().mockResolvedValue(1) };
  const svc = new ReviewService(
    snapshotService as unknown as ReviewSnapshotService,
    inApp as unknown as InAppMessageService,
  );
  return { svc, prisma, snapshotService, inApp };
}

describe('人工提交（submitHuman）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('即时 APPROVED：versionNumber 链内自增 + 审计', async () => {
    const { svc, prisma } = makeService();
    prisma.resourceVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 3 } });
    prisma.resourceVersion.findFirst.mockResolvedValue(null); // 无基线
    prisma.resourceVersion.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => makeRow({ ...data, id: 'sub-new' }),
    );

    const dto = await svc.submitHuman(TENANT, APP, 'OBJECT', 'obj-1', 'user-1');
    expect(dto.status).toBe('APPROVED');
    expect(dto.source).toBe('HUMAN');
    expect(dto.versionNumber).toBe(4);
    const created = prisma.resourceVersion.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(created.data.submittedVia).toBe('studio');
  });

  it('资源不存在 → NotFound', async () => {
    const { svc } = makeService(null);
    await expect(svc.submitHuman(TENANT, APP, 'OBJECT', 'ghost', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AI 提交（submitAiDraft）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PENDING + 取代同资源旧待审 + 通知审核者', async () => {
    const { svc, prisma, inApp } = makeService();
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-1' }); // 按 apiName 收编
    prisma.resourceVersion.aggregate.mockResolvedValue({ _max: { versionNumber: null } });
    prisma.resourceVersion.findFirst.mockResolvedValue(null);
    prisma.resourceVersion.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => makeRow({ ...data }),
    );
    prisma.userRole.findMany.mockResolvedValue([{ userId: 'admin-1' }]);

    const dto = await svc.submitAiDraft(
      TENANT,
      {
        module: 'OBJECT',
        appId: APP,
        apiName: 'contract',
        name: '采购合同',
        snapshot: liveSnapshot,
      },
      'ai-agent',
    );

    expect(dto.status).toBe('PENDING');
    expect(dto.source).toBe('AI_MCP');
    expect(dto.entityId).toBe('obj-1');
    expect(prisma.resourceVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    );
    expect(inApp.create).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['admin-1'] }));
  });

  it('显式 entityId 指向不存在的资源 → NotFound', async () => {
    const { svc } = makeService(null);
    await expect(
      svc.submitAiDraft(
        TENANT,
        {
          module: 'OBJECT',
          appId: APP,
          apiName: 'contract',
          name: '采购合同',
          snapshot: liveSnapshot,
          entityId: 'ghost',
        },
        'ai-agent',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('批准（approve）', () => {
  beforeEach(() => vi.clearAllMocks());

  function arrangeHappyPath(prisma: ReturnType<typeof getMockPrisma>, liveSnap: unknown) {
    prisma.resourceVersion.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string } }) => {
        if (where.id === 'base-1')
          return makeRow({ id: 'base-1', status: 'APPROVED', snapshot: liveSnap });
        return makeRow(); // PENDING 提交单
      },
    );
    prisma.resourceVersion.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        makeRow({
          status: 'APPROVED',
          reviewedBy: data.reviewedBy ?? null,
          reviewedAt: data.reviewedAt ?? null,
        }),
    );
  }

  it('快照落活表 + 置 APPROVED + 通知提交者', async () => {
    const { svc, prisma, snapshotService, inApp } = makeService();
    arrangeHappyPath(prisma, liveSnapshot);
    const dto = await svc.approve(TENANT, APP, 'sub-1', 'reviewer-1', { comment: '通过' });

    expect(dto.status).toBe('APPROVED');
    expect(dto.reviewedBy).toBe('reviewer-1');
    expect(snapshotService.applySnapshot).toHaveBeenCalledWith(
      TENANT,
      APP,
      'OBJECT',
      liveSnapshot,
      'obj-1',
      'review:reviewer-1',
    );
    expect(inApp.create).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['ai-agent'] }));
  });

  it('活表偏离提交基线 → 拒绝（漂移保护）', async () => {
    const { svc, prisma, snapshotService } = makeService();
    const drifted = {
      ...liveSnapshot,
      fields: [{ apiName: 'hacked', label: '人工改动', type: 'text' }],
    };
    arrangeHappyPath(prisma, drifted);
    await expect(svc.approve(TENANT, APP, 'sub-1', 'reviewer-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(snapshotService.applySnapshot).not.toHaveBeenCalled();
  });

  it('force 放行漂移覆盖', async () => {
    const { svc, prisma, snapshotService } = makeService();
    arrangeHappyPath(prisma, { ...liveSnapshot, name: '人工改过' });
    await svc.approve(TENANT, APP, 'sub-1', 'reviewer-1', { force: true });
    expect(snapshotService.applySnapshot).toHaveBeenCalled();
  });

  it('非 PENDING 提交单不能重复审批', async () => {
    const { svc, prisma } = makeService();
    prisma.resourceVersion.findFirst.mockResolvedValue(makeRow({ status: 'APPROVED' }));
    await expect(svc.approve(TENANT, APP, 'sub-1', 'reviewer-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('驳回（reject）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('置 REJECTED + 意见回传提交者', async () => {
    const { svc, prisma, inApp } = makeService();
    prisma.resourceVersion.findFirst.mockResolvedValue(makeRow());
    prisma.resourceVersion.update.mockResolvedValue(makeRow({ status: 'REJECTED' }));

    const dto = await svc.reject(TENANT, APP, 'sub-1', 'reviewer-1', '金额字段命名不规范');
    expect(dto.status).toBe('REJECTED');
    const updated = prisma.resourceVersion.update.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updated.data.reviewComment).toBe('金额字段命名不规范');
    expect(inApp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['ai-agent'],
        title: expect.stringContaining('驳回'),
      }),
    );
  });
});

describe('撤销未提交（discardDraft）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('无基线 → BadRequest', async () => {
    const { svc, prisma } = makeService();
    prisma.resourceVersion.findFirst.mockResolvedValue(null);
    await expect(svc.discardDraft(TENANT, APP, 'OBJECT', 'obj-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('与基线一致 → reverted=false 免操作', async () => {
    const { svc, prisma, snapshotService } = makeService();
    prisma.resourceVersion.findFirst.mockResolvedValue(
      makeRow({ status: 'APPROVED', snapshot: liveSnapshot }),
    );
    const r = await svc.discardDraft(TENANT, APP, 'OBJECT', 'obj-1', 'user-1');
    expect(r.reverted).toBe(false);
    expect(snapshotService.applySnapshot).not.toHaveBeenCalled();
  });

  it('有漂移 → 恢复基线快照', async () => {
    const { svc, prisma, snapshotService } = makeService();
    const drifted = { ...liveSnapshot, name: '人工改过' };
    prisma.resourceVersion.findFirst.mockResolvedValue(
      makeRow({ status: 'APPROVED', snapshot: liveSnapshot }),
    );
    // extractLive 返回漂移态
    (snapshotService.extractLive as ReturnType<typeof vi.fn>).mockResolvedValue({
      entityId: 'obj-1',
      apiName: 'contract',
      name: '采购合同',
      snapshot: drifted,
    });
    const r = await svc.discardDraft(TENANT, APP, 'OBJECT', 'obj-1', 'user-1');
    expect(r.reverted).toBe(true);
    expect(snapshotService.applySnapshot).toHaveBeenCalledWith(
      TENANT,
      APP,
      'OBJECT',
      liveSnapshot,
      'obj-1',
      'discard:user-1',
    );
  });
});

describe('未提交变更清单（listDirtyResources）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('漂移资源与从未提交的资源都列出', async () => {
    const { svc, prisma } = makeService();
    prisma.objectMeta.findMany.mockResolvedValue([
      {
        id: 'obj-drift',
        apiName: 'contract',
        name: '采购合同',
        description: null,
        icon: null,
        fields: [],
      },
    ]);
    prisma.pageMeta.findMany.mockResolvedValue([]);
    prisma.processDef.findMany.mockResolvedValue([]);
    // 第一次 findFirst（contract 基线）→ 与活表不同的快照
    prisma.resourceVersion.findFirst
      .mockResolvedValueOnce(
        makeRow({
          status: 'APPROVED',
          versionNumber: 1,
          snapshot: { ...liveSnapshot, name: '基线旧名' },
        }),
      )
      .mockResolvedValueOnce(
        makeRow({
          status: 'APPROVED',
          versionNumber: 1,
          snapshot: { ...liveSnapshot, name: '基线旧名' },
        }),
      );
    // 第二轮（从未提交）→ 无基线
    const dirty = await svc.listDirtyResources(TENANT, APP);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.module).toBe('OBJECT');
    expect(dirty[0]!.baselineVersionNumber).toBe(1);
  });

  it('从未提交的资源 baselineVersionNumber=null', async () => {
    const { svc, prisma } = makeService();
    prisma.objectMeta.findMany.mockResolvedValue([
      {
        id: 'obj-new',
        apiName: 'fresh',
        name: '新对象',
        description: null,
        icon: null,
        fields: [],
      },
    ]);
    prisma.pageMeta.findMany.mockResolvedValue([]);
    prisma.processDef.findMany.mockResolvedValue([]);
    prisma.resourceVersion.findFirst.mockResolvedValue(null);
    const dirty = await svc.listDirtyResources(TENANT, APP);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.baselineVersionNumber).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 批量提交 / 批量批准 / 批量驳回（submit_app_drafts 资源依赖链）
// ---------------------------------------------------------------------------

describe('引用令牌纯函数（collectRefTokens / replaceRefTokens）', () => {
  it('深度收集 @ref 令牌（对象/页面），replace 按 map 替换且未覆盖令牌保留', () => {
    const schema = {
      nodes: [
        { id: 'n1', type: 'user_task', data: { pageId: '@ref:page:approval_form' } },
        { id: 'n2', type: 'assign', data: { value: '@ref:object:meeting_room' } },
      ],
      edges: [{ sourceNodeID: 'n1', targetNodeID: '@ref:page:approval_form' }],
      plain: 'not-a-token',
    };
    const tokens = collectRefTokens(schema);
    expect([...tokens].sort()).toEqual(['@ref:object:meeting_room', '@ref:page:approval_form']);

    const replaced = replaceRefTokens(schema, new Map([['@ref:page:approval_form', 'page-9']]));
    expect(replaced.nodes[0]!.data['pageId']).toBe('page-9');
    // 未覆盖的对象令牌原样保留
    expect(replaced.nodes[1]!.data['value']).toBe('@ref:object:meeting_room');
    expect(replaced.edges[0]!.targetNodeID).toBe('page-9');
    expect(replaced.plain).toBe('not-a-token');
  });
});

describe('批量提交（submitAiBatch）', () => {
  const { svc, prisma } = makeService();

  it('全部资源共享同一 batchId 进审；空批次拒绝', async () => {
    prisma.resourceVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 1 } });
    prisma.resourceVersion.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `sub-${data['apiName']}`,
        createdAt: new Date('2026-10-03T00:00:00Z'),
        ...data,
      }),
    );

    const { batchId, rows } = await svc.submitAiBatch(
      TENANT,
      {
        appId: APP,
        items: [
          {
            module: 'OBJECT',
            appId: APP,
            apiName: 'meeting_room',
            name: '会议室',
            snapshot: liveSnapshot,
          },
          {
            module: 'PAGE',
            appId: APP,
            apiName: 'booking_form',
            name: '预定表单',
            snapshot: liveSnapshot,
          },
        ],
      },
      'ai-agent',
    );

    expect(batchId).toBeTruthy();
    expect(rows).toHaveLength(2);
    // createVersion 传给 prisma 的每行都带同一 batchId
    const batchIds = prisma.resourceVersion.create.mock.calls.map(
      (c: Array<{ data: Record<string, unknown> }>) => c[0]!.data['batchId'],
    );
    expect(new Set(batchIds)).toEqual(new Set([batchId]));

    await expect(svc.submitAiBatch(TENANT, { appId: APP, items: [] }, 'ai-agent')).rejects.toThrow(
      '至少包含一项',
    );
  });
});

describe('批量批准（approveBatch）', () => {
  it('拓扑序落地（对象→页面→流程）+ 令牌解析（页面 objectId / 流程 pageId）', async () => {
    const { svc, prisma, snapshotService } = makeService();
    // 批次行故意乱序（PROCESS 在前）
    prisma.resourceVersion.findMany.mockResolvedValue([
      {
        ...makeRow({ id: 'sub-p1', module: 'PROCESS', apiName: 'booking_flow', name: '预定审批' }),
        snapshot: {
          apiName: 'booking_flow',
          name: '预定审批',
          triggerType: 'RECORD_CREATED',
          cron: null,
          workflowSchema: {
            nodes: [
              { id: 's', type: 'start' },
              { id: 't', type: 'user_task', data: { pageId: '@ref:page:booking_form' } },
              { id: 'e', type: 'end' },
            ],
            edges: [],
          },
        },
      },
      {
        ...makeRow({ id: 'sub-o1', module: 'OBJECT', apiName: 'meeting_room', name: '会议室' }),
        snapshot: { apiName: 'meeting_room', name: '会议室', fields: [] },
      },
      {
        ...makeRow({ id: 'sub-g1', module: 'PAGE', apiName: 'booking_form', name: '预定表单' }),
        snapshot: {
          apiName: 'booking_form',
          name: '预定表单',
          type: 'form_page',
          objectId: '@ref:object:meeting_room',
          schema: { type: 'page' },
        },
      },
    ]);
    prisma.resourceVersion.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...makeRow(),
        ...data,
      }),
    );
    // 令牌解析：对象/页面按 apiName 命中活表
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-meeting' });
    prisma.pageMeta.findFirst.mockResolvedValue({ id: 'page-booking' });

    const applied = await svc.approveBatch(TENANT, APP, 'batch-1', 'reviewer-1', {});

    expect(applied).toHaveLength(3);
    // 拓扑序：OBJECT 先于 PAGE 先于 PROCESS（按 applySnapshot 调用顺序断言）
    const appliedModules = (
      snapshotService.applySnapshot as ReturnType<typeof vi.fn>
    ).mock.calls.map((c: Array<unknown>) => c[2]);
    expect(appliedModules).toEqual(['OBJECT', 'PAGE', 'PROCESS']);
    // 页面快照 objectId 令牌已解析为真实对象 ID
    const pageSnapshot = (snapshotService.applySnapshot as ReturnType<typeof vi.fn>).mock
      .calls[1]![3];
    expect((pageSnapshot as Record<string, unknown>)['objectId']).toBe('obj-meeting');
    // 流程 schema 中 pageId 令牌已重写
    const procSnapshot = (snapshotService.applySnapshot as ReturnType<typeof vi.fn>).mock
      .calls[2]![3];
    const wf = (procSnapshot as Record<string, unknown>)['workflowSchema'] as {
      nodes: Array<{ data?: Record<string, unknown> }>;
    };
    expect(wf.nodes[1]!.data!['pageId']).toBe('page-booking');
  });

  it('批次不存在或已处理 → 拒绝', async () => {
    const { svc, prisma } = makeService();
    prisma.resourceVersion.findMany.mockResolvedValue([]);
    await expect(svc.approveBatch(TENANT, APP, 'batch-x', 'r1', {})).rejects.toThrow('批次不存在');
  });

  it('令牌目标未落地 → 报错并标明失败项', async () => {
    const { svc, prisma } = makeService();
    prisma.resourceVersion.findMany.mockResolvedValue([
      {
        ...makeRow({ id: 'sub-g1', module: 'PAGE', apiName: 'orphan_form', name: '孤儿页面' }),
        snapshot: {
          apiName: 'orphan_form',
          name: '孤儿页面',
          type: 'form_page',
          objectId: '@ref:object:ghost',
          schema: { type: 'page' },
        },
      },
    ]);
    prisma.objectMeta.findFirst.mockResolvedValue(null);
    await expect(svc.approveBatch(TENANT, APP, 'batch-2', 'r1', {})).rejects.toThrow('orphan_form');
  });
});

describe('批量驳回（rejectBatch）', () => {
  it('批次内全部 PENDING 级联驳回并回传意见', async () => {
    const { svc, prisma, inApp } = makeService();
    prisma.resourceVersion.findMany.mockResolvedValue([
      makeRow({ id: 'sub-1', submittedBy: 'ai-agent', name: '会议室' }),
      makeRow({ id: 'sub-2', submittedBy: 'ai-agent', name: '预定表单' }),
    ]);
    prisma.resourceVersion.updateMany.mockResolvedValue({ count: 2 });

    const res = await svc.rejectBatch(TENANT, APP, 'batch-3', 'reviewer-1', '字段命名不合规范');

    expect(res).toEqual({ rejected: 2 });
    expect(prisma.resourceVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', reviewComment: '字段命名不合规范' }),
      }),
    );
    expect(inApp.create).toHaveBeenCalled();

    prisma.resourceVersion.findMany.mockResolvedValue([]);
    await expect(svc.rejectBatch(TENANT, APP, 'batch-x', 'r1', 'x')).rejects.toThrow('批次不存在');
  });
});

describe('页面快照 api.url 令牌解析（#18）', () => {
  it('applyPage 落地页面时把 schema 内 @ref:object 令牌解析为真实对象 ID', async () => {
    const prisma = getMockPrisma();
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-meeting-real' });
    prisma.pageMeta.findFirst.mockResolvedValue(null); // 新建分支
    const pageService = {
      create: vi.fn().mockResolvedValue({ id: 'page-new' }),
      update: vi.fn(),
    };
    const snapshotSvc = new ReviewSnapshotService(
      pageService as never,
      {} as never,
      {} as never,
      { log: vi.fn() } as never,
    );
    const applied = await snapshotSvc.applySnapshot(
      TENANT,
      APP,
      'PAGE',
      {
        apiName: 'meeting_form',
        name: '会议表单',
        type: 'form_page',
        schema: {
          type: 'page',
          body: [
            {
              type: 'form',
              api: {
                method: 'post',
                url: '/api/v1/apps/app-1/objects/@ref:object:meeting_booking/records',
              },
            },
          ],
        },
      } as never,
      null,
      'review:test',
    );
    expect(applied).toBe('page-new');
    const createdSnap = pageService.create.mock.calls[0]?.[2] as {
      apiName?: string;
      schema?: { body?: Array<{ api?: { url?: string } }> };
    };
    expect(createdSnap.apiName).toBe('meeting_form');
    const url = createdSnap.schema?.body?.[0]?.api?.url ?? '';
    expect(url).toContain('obj-meeting-real');
    expect(url).not.toContain('@ref:');
  });
});
