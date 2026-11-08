/**
 * 候选组匹配扩展单测（流程引擎专题 R2-A2）——
 * candidateGroups 语义扩展为「角色 ID 或组织 ID」（Flowable candidateGroups 同款语义）：
 * 任务中心待办/已办与实例可见性按「我的角色 ∪ 我的组织」匹配。
 * 组织审批节点（assigneeType=ORG）候选组存组织 ID，此前匹配只认角色 → 组织任务无人可见。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockPrisma } from '../test/test-helpers.js';
import { ProcessService } from './process.service.js';

const TENANT = 'tenant-001';
const USER = 'user-001';

function makeService() {
  return new ProcessService(
    {} as unknown as ConstructorParameters<typeof ProcessService>[0],
    {} as unknown as ConstructorParameters<typeof ProcessService>[1],
    {} as unknown as ConstructorParameters<typeof ProcessService>[2],
  );
}

describe('listTasks 候选组匹配（角色 ∪ 组织）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.userRole.findMany.mockResolvedValue([{ roleId: 'role-1' }]);
    prisma.orgMember.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    prisma.orgRoleGrant.findMany.mockResolvedValue([]);
    prisma.user.findFirst.mockResolvedValue({ email: 'u@t.dev' });
    prisma.processTask.findMany.mockResolvedValue([]);
    prisma.processTask.count.mockResolvedValue(0);
  });

  it('candidateGroups hasSome 同时含角色 ID 与组织 ID', async () => {
    await makeService().listTasks(TENANT, USER);
    const arg = prisma.processTask.findMany.mock.calls[0][0];
    const orClause = arg.where.OR as Array<Record<string, unknown>>;
    const cg = orClause.find((c) => 'candidateGroups' in c) as {
      candidateGroups: { hasSome: string[] };
    };
    expect(cg.candidateGroups.hasSome).toEqual(expect.arrayContaining(['role-1', 'org-1']));
  });

  it('无组织成员身份时仅角色匹配（回归对照）', async () => {
    prisma.orgMember.findMany.mockResolvedValue([]);
    await makeService().listTasks(TENANT, USER);
    const arg = prisma.processTask.findMany.mock.calls[0][0];
    const orClause = arg.where.OR as Array<Record<string, unknown>>;
    const cg = orClause.find((c) => 'candidateGroups' in c) as {
      candidateGroups: { hasSome: string[] };
    };
    expect(cg.candidateGroups.hasSome).toEqual(['role-1']);
  });
});

describe('getInstance 实例可见性（组织候选=任务参与人）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-1',
      tenantId: TENANT,
      processDefId: 'def-1',
      environmentId: 'prod',
      frozenWorkflowSchema: null,
      triggerContext: { triggerType: 'MANUAL', triggeredByUser: 'someone-else' },
      variables: {},
      status: 'WAITING_USER_TASK',
      activeNodeIds: [],
      startedAt: new Date('2026-10-11T00:00:00Z'),
      finishedAt: null,
      error: null,
      timedOut: false,
      processDef: { name: '审批', apiName: 'approval', version: 1 },
      tasks: [{ id: 'task-1', assignee: null, candidateGroups: ['org-1'] }],
    });
    prisma.user.findFirst.mockResolvedValue({ isPlatformAdmin: false, email: 'u@t.dev' });
    prisma.userRole.findMany.mockResolvedValue([]);
    prisma.orgMember.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
  });

  it('组织候选组成员可查看实例（修复前 candidateGroups 只按角色匹配 → Forbidden）', async () => {
    const dto = await makeService().getInstance(TENANT, 'inst-1', USER);
    expect(dto.id).toBe('inst-1');
  });
});

// ---------------------------------------------------------------------------
// functional-06（◆3=A）：任务列表监控筛选——processDefId/assignee 需租户级
// BUILDER/ADMIN（真「流程监控」语义）；无参数路径不要求监控角色（回归对照）。
// ---------------------------------------------------------------------------

describe('functional-06 listTasks 监控筛选（processDefId/assignee）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    // 覆盖两条 user.findFirst 消费点：监控断言（isPlatformAdmin）+ listTasks 邮箱匹配
    prisma.user.findFirst.mockResolvedValue({
      email: 'u@t.dev',
      isPlatformAdmin: false,
    });
    prisma.userRole.findMany.mockResolvedValue([{ roleId: 'role-1' }]);
    prisma.orgMember.findMany.mockResolvedValue([]);
    prisma.orgRoleGrant.findMany.mockResolvedValue([]);
    prisma.processTask.findMany.mockResolvedValue([]);
    prisma.processTask.count.mockResolvedValue(0);
  });

  it('BUILDER 携带 processDefId → where 增 instance.processDefId 过滤', async () => {
    prisma.userRole.findFirst.mockResolvedValue({ roleId: 'r-builder' });

    await makeService().listTasks(TENANT, USER, undefined, undefined, undefined, 'pd-1');

    const arg = prisma.processTask.findMany.mock.calls[0]?.[0] as {
      where: { instance?: { processDefId?: string } };
    };
    expect(arg.where.instance).toEqual({ processDefId: 'pd-1' });
  });

  it('非监控用户携带 processDefId → 403（◆3=A：跨人监控需租户级 BUILDER/ADMIN）', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await expect(
      makeService().listTasks(TENANT, USER, undefined, undefined, undefined, 'pd-1'),
    ).rejects.toThrow(/流程监控/);
    expect(prisma.processTask.findMany).not.toHaveBeenCalled();
  });

  it('平台超管携带 assignee → 放行（admin 短路）且 where.OR 精确受理人', async () => {
    prisma.user.findFirst.mockResolvedValue({
      email: 'u@t.dev',
      isPlatformAdmin: true,
    });

    await makeService().listTasks(
      TENANT,
      USER,
      undefined,
      undefined,
      undefined,
      undefined,
      'someone-else',
    );

    const arg = prisma.processTask.findMany.mock.calls[0]?.[0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(arg.where.OR).toEqual([{ assignee: 'someone-else' }]);
  });

  it('非监控用户携带他人 assignee → 403', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await expect(
      makeService().listTasks(
        TENANT,
        USER,
        undefined,
        undefined,
        undefined,
        undefined,
        'someone-else',
      ),
    ).rejects.toThrow(/流程监控/);
  });

  it('携带本人 assignee 不要求监控角色（=普通「我的任务」查询）', async () => {
    prisma.userRole.findFirst.mockResolvedValue(null);

    await makeService().listTasks(TENANT, USER, undefined, undefined, undefined, undefined, USER);

    expect(prisma.userRole.findFirst).not.toHaveBeenCalled();
    expect(prisma.processTask.findMany).toHaveBeenCalled();
  });

  it('无监控参数 → 不触发权限断言（既有路径回归对照）', async () => {
    await makeService().listTasks(TENANT, USER);

    expect(prisma.userRole.findFirst).not.toHaveBeenCalled();
  });
});
