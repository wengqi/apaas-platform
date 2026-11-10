/**
 * 「我发起的」实例列表单测（任务中心修复 2026-10-10）—
 * 发起人归属过滤（triggerContext.triggeredByUser JSON 路径）/ 状态过滤 / 分页 / DTO 投影。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockPrisma } from '../test/test-helpers.js';
import { ProcessService } from './process.service.js';

const TENANT = 'tenant-001';
const USER = 'user-001';

function makeService() {
  const service = new ProcessService(
    {} as unknown as ConstructorParameters<typeof ProcessService>[0],
    {} as unknown as ConstructorParameters<typeof ProcessService>[1],
    {} as unknown as ConstructorParameters<typeof ProcessService>[2],
  );
  return service;
}

function mockInstanceRow() {
  return {
    id: 'inst-1',
    tenantId: TENANT,
    processDefId: 'def-1',
    environmentId: 'prod',
    frozenWorkflowSchema: null,
    triggerContext: {
      triggeredBy: 'RECORD_CREATED',
      triggeredByUser: USER,
      inputs: { title: '测试1010' },
    },
    variables: {},
    status: 'WAITING_USER_TASK',
    activeNodeIds: ['approve_1'],
    startedAt: new Date('2026-10-10T12:59:10Z'),
    finishedAt: null,
    error: null,
    timedOut: false,
    processDef: { name: '报销审批', apiName: 'expense_approval', version: 1 },
  };
}

describe('ProcessService.listMyInstances', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按 triggerContext.triggeredByUser 过滤 + 租户隔离，返回 toInstanceDto 投影', async () => {
    prisma.processInstance.findMany.mockResolvedValue([mockInstanceRow()]);
    prisma.processInstance.count.mockResolvedValue(1);

    const result = await makeService().listMyInstances(TENANT, USER);

    const arg = prisma.processInstance.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe(TENANT);
    expect(arg.where.triggerContext).toEqual({ path: ['triggeredByUser'], equals: USER });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'inst-1',
      status: 'WAITING_USER_TASK',
      state: 'WAITING_USER_TASK',
      triggeredByUser: USER,
      processDef: { name: '报销审批', apiName: 'expense_approval', version: 1 },
    });
    expect(result.items[0]?.startedAt).toBe('2026-10-10T12:59:10.000Z');
  });

  it('status 过滤直传 Prisma 枚举', async () => {
    prisma.processInstance.findMany.mockResolvedValue([]);
    prisma.processInstance.count.mockResolvedValue(0);

    await makeService().listMyInstances(TENANT, USER, 'COMPLETED');

    const arg = prisma.processInstance.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe('COMPLETED');
  });

  it('分页参数换算 skip/take（page=3, pageSize=10 → skip=20）', async () => {
    prisma.processInstance.findMany.mockResolvedValue([]);
    prisma.processInstance.count.mockResolvedValue(0);

    await makeService().listMyInstances(TENANT, USER, undefined, 3, 10);

    const arg = prisma.processInstance.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(20);
    expect(arg.take).toBe(10);
  });
});

// ===========================================================================
// 波次⑥ — PE-24 分页封顶 / PE-32 列投影（R2-scale-06）
// ===========================================================================

describe('listMyInstances — PE-24 分页封顶与 PE-32 列投影', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.processInstance.findMany.mockResolvedValue([]);
    prisma.processInstance.count.mockResolvedValue(0);
  });

  it('PE-24：pageSize 封顶 100（R2-correctness-09：明示封顶值，对齐 record 同款约定）', async () => {
    await makeService().listMyInstances(TENANT, USER, undefined, 1, 100000);

    const arg = prisma.processInstance.findMany.mock.calls[0][0];
    expect(arg.take).toBe(100);
    expect(prisma.processInstance.count).toHaveBeenCalledTimes(1);
  });

  it('PE-32：findMany select 投影——排除 frozenWorkflowSchema 大列，保留 DTO 消费列', async () => {
    await makeService().listMyInstances(TENANT, USER);

    const arg = prisma.processInstance.findMany.mock.calls[0][0];
    expect(arg.select).toBeDefined();
    // 零消费大列不拉（单行 ~25KB，PE-23 索引回表行宽同步受益）
    expect(arg.select.frozenWorkflowSchema).toBeUndefined();
    // DTO 消费列全保留（契约零破坏）
    expect(arg.select.id).toBe(true);
    expect(arg.select.triggerContext).toBe(true);
    expect(arg.select.variables).toBe(true);
    expect(arg.select.status).toBe(true);
    expect(arg.select.activeNodeIds).toBe(true);
    expect(arg.select.startedAt).toBe(true);
    expect(arg.select.finishedAt).toBe(true);
    expect(arg.select.error).toBe(true);
    expect(arg.select.snapshotVersion).toBe(true);
    expect(arg.select.processDef).toEqual({ select: { name: true, apiName: true, version: true } });
  });
});
