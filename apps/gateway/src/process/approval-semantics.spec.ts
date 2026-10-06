/**
 * R1.3 审批语义单元测试 — 多人审批聚合（会签/或签/依次）+ 撤回。
 *
 * 覆盖：
 * - completeTask 聚合：会签未齐不推进 / 会签齐了推进 / 会签任一拒绝立即驳回 /
 *   会签并发双推进封窗（锁内重验）/ 或签首决终结兄弟任务 / 依次中途生成下一任务 /
 *   依次最后一人通过推进 / 依次拒绝直接驳回
 * - UserTaskExecutor：多模式任务生成（countersign/or_sign 全量、sequential 单个、
 *   空 approveUsers 报错、无受理人报错、人数上限）
 * - withdrawInstance：发起人校验 / 状态校验 / 撤回复用 cancelProcess
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProcessEngine } from './process-engine.js';
import { UserTaskExecutor } from './node-executors/user-task.executor.js';
import { ProcessService } from './process.service.js';
import type { NodeExecutor } from './types.js';
import type { WorkflowSchema, WorkflowNode } from '@apaas/shared';
import { getMockPrisma, createMockQueue } from '../test/test-helpers.js';
import { makeProcessDef, makeProcessInstance, makeProcessTask } from '../test/mock-factories.js';

// ---------------------------------------------------------------------------
// Mock 基建（与 process-engine.spec.ts 同构）
// ---------------------------------------------------------------------------

function createMockRegistry(executors: NodeExecutor[]) {
  const map = new Map(executors.map((e) => [e.type, e]));
  return {
    get: vi.fn((type: string) => {
      const executor = map.get(type);
      if (!executor) throw new Error(`未注册的节点类型: ${type}`);
      return executor;
    }),
  };
}

function createEngine(executors: NodeExecutor[] = []) {
  const registry = createMockRegistry(executors);
  const inAppMessageService = { create: vi.fn().mockResolvedValue(undefined) };
  const processQueue = createMockQueue();
  const delayQueue = createMockQueue();
  const recordService = { update: vi.fn().mockResolvedValue({ id: 'record-mock' }) };
  const redisLock = {
    withLock: (_key: string, fn: () => Promise<unknown>) => fn(),
  } as unknown as ConstructorParameters<typeof ProcessEngine>[2];
  const engine = new ProcessEngine(
    registry as unknown as ConstructorParameters<typeof ProcessEngine>[0],
    inAppMessageService as unknown as ConstructorParameters<typeof ProcessEngine>[1],
    redisLock,
    {
      resolve: vi.fn().mockResolvedValue({
        environmentId: '',
        versionId: null,
        bundle: null,
      }),
    } as unknown as ConstructorParameters<typeof ProcessEngine>[3],
    processQueue as unknown as ConstructorParameters<typeof ProcessEngine>[4],
    delayQueue as unknown as ConstructorParameters<typeof ProcessEngine>[5],
    recordService as unknown as ConstructorParameters<typeof ProcessEngine>[6],
  );
  return { engine, registry, processQueue, recordService };
}

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, meta: {}, data } as WorkflowNode;
}

function makeInstanceRow(overrides: Record<string, unknown> = {}) {
  return makeProcessInstance(overrides) as unknown as import('./types.js').InstanceRow;
}

/** 构造 user_task 单节点 schema（end 节点可选）。 */
function makeUserTaskSchema(nodeData: Record<string, unknown>) {
  return {
    nodes: [makeNode('n1', 'user_task', nodeData), makeNode('n2', 'end')],
    edges: [{ sourceNodeID: 'n1', targetNodeID: 'n2' }],
  } as unknown as WorkflowSchema;
}

describe('R1.3 多人审批聚合 — completeTask', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.processInstance.update.mockResolvedValue({});
    prisma.processInstance.findFirst.mockImplementation((args: { where: { id: string } }) => {
      return Promise.resolve(makeInstanceRow({ id: args.where.id, status: 'WAITING_USER_TASK' }));
    });
    prisma.nodeExecution.update.mockResolvedValue({});
    prisma.processQueue = undefined;
  });

  function setupTask(schema: WorkflowSchema, overrides: Record<string, unknown> = {}) {
    const instance = makeProcessInstance({
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['n1'],
      processDef: makeProcessDef({ workflowSchema: schema }),
      ...overrides,
    });
    const task = makeProcessTask({ nodeId: 'n1', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processInstance.findFirst.mockResolvedValue(instance);
    return task;
  }

  it('会签：仍有 PENDING 兄弟任务时不推进令牌', async () => {
    const schema = makeUserTaskSchema({ approvalMode: 'countersign', approveUsers: ['u1', 'u2'] });
    setupTask(schema);
    // 兄弟任务：本任务已 APPROVED（updateMany 后）+ 另一人 PENDING
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
      { id: 't2', status: 'PENDING', assignee: 'u2', createdAt: new Date() },
    ]);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    // 不入队推进
    expect(processQueue.add).not.toHaveBeenCalled();
    // 不更新实例 activeNodeIds（无 instance.update 调用——等待其余任务）
    expect(prisma.processInstance.update).not.toHaveBeenCalled();
  });

  it('会签：全部 approved 后推进令牌', async () => {
    const schema = makeUserTaskSchema({ approvalMode: 'countersign', approveUsers: ['u1', 'u2'] });
    setupTask(schema);
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
      { id: 't2', status: 'APPROVED', assignee: 'u2', createdAt: new Date() },
    ]);
    prisma.processTask.count.mockResolvedValue(0);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t2', 'u2', 'approve', undefined, undefined);

    expect(processQueue.add).toHaveBeenCalledTimes(1);
  });

  it('语义裁决（2026-10-06）：未配置 rejectToNodeId 的节点拒绝被硬闸拦截', async () => {
    const schema = makeUserTaskSchema({ approvalMode: 'countersign', approveUsers: ['u1', 'u2'] });
    setupTask(schema);
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'PENDING', assignee: 'u1', createdAt: new Date() },
      { id: 't2', status: 'PENDING', assignee: 'u2', createdAt: new Date() },
    ]);

    const { engine } = createEngine();
    await expect(engine.completeTask('t1', 'u1', 'reject', '不同意', undefined)).rejects.toThrow(
      /未配置驳回跳转/,
    );
  });

  it('会签：任一 rejected 立即取消兄弟任务并按驳回边推进', async () => {
    const schema = makeUserTaskSchema({
      approvalMode: 'countersign',
      approveUsers: ['u1', 'u2'],
      rejectToNodeId: 'n2', // 语义裁决（2026-10-06）：驳回操作存在的前提是配置了驳回跳转
    });
    setupTask(schema);
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'REJECTED', assignee: 'u1', createdAt: new Date() },
      { id: 't2', status: 'PENDING', assignee: 'u2', createdAt: new Date() },
    ]);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t1', 'u1', 'reject', '不同意', undefined);

    // 取消兄弟 PENDING 任务
    expect(prisma.processTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nodeId: 'n1', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    // 驳回也推进（入队）
    expect(processQueue.add).toHaveBeenCalledTimes(1);
  });

  it('会签并发封窗：锁内重验仍有 PENDING 时不推进', async () => {
    const schema = makeUserTaskSchema({ approvalMode: 'countersign', approveUsers: ['u1', 'u2'] });
    setupTask(schema);
    // 锁外读：兄弟已全 APPROVED（竞态快照）
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
      { id: 't2', status: 'APPROVED', assignee: 'u2', createdAt: new Date() },
    ]);
    // 锁内重验：t2 实际仍 PENDING（并发窗口）
    prisma.processTask.count.mockResolvedValue(1);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    // 锁内重验触发且不入队
    expect(prisma.processTask.count).toHaveBeenCalled();
    expect(processQueue.add).not.toHaveBeenCalled();
  });

  it('或签：首个决策取消其余 PENDING 并立即推进', async () => {
    const schema = makeUserTaskSchema({
      approvalMode: 'or_sign',
      approveUsers: ['u1', 'u2', 'u3'],
    });
    setupTask(schema);
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
      { id: 't2', status: 'PENDING', assignee: 'u2', createdAt: new Date() },
      { id: 't3', status: 'PENDING', assignee: 'u3', createdAt: new Date() },
    ]);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    // 取消 2 个兄弟任务
    expect(prisma.processTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nodeId: 'n1', status: 'PENDING' }),
      }),
    );
    expect(processQueue.add).toHaveBeenCalledTimes(1);
  });

  it('依次：approved 后生成下一人任务且不推进', async () => {
    const schema = makeUserTaskSchema({
      approvalMode: 'sequential',
      approveUsers: ['u1', 'u2', 'u3'],
    });
    const instance = makeProcessInstance({
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['n1'],
      variables: { n1: { sequentialIndex: 0 } },
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'n1', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
    ]);
    prisma.processTask.create.mockResolvedValue({});
    prisma.processInstance.findFirst.mockResolvedValue(instance);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    // 生成下一人（u2）任务
    expect(prisma.processTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignee: 'u2', status: 'PENDING' }),
      }),
    );
    // 进度推进到 1
    expect(prisma.processInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          variables: expect.objectContaining({ n1: { sequentialIndex: 1 } }),
        }),
      }),
    );
    // 不推进令牌
    expect(processQueue.add).not.toHaveBeenCalled();
  });

  it('依次：最后一人 approved 后推进令牌', async () => {
    const schema = makeUserTaskSchema({
      approvalMode: 'sequential',
      approveUsers: ['u1', 'u2'],
    });
    const instance = makeProcessInstance({
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['n1'],
      variables: { n1: { sequentialIndex: 1 } },
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'n1', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't2', status: 'APPROVED', assignee: 'u2', createdAt: new Date() },
    ]);
    prisma.processTask.count.mockResolvedValue(0);
    prisma.processInstance.findFirst.mockResolvedValue(instance);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t2', 'u2', 'approve', undefined, undefined);

    expect(processQueue.add).toHaveBeenCalledTimes(1);
    expect(prisma.processTask.create).not.toHaveBeenCalled();
  });

  it('依次：任一环节 rejected 直接驳回推进', async () => {
    const schema = makeUserTaskSchema({
      approvalMode: 'sequential',
      approveUsers: ['u1', 'u2'],
      rejectToNodeId: 'n2',
    });
    const instance = makeProcessInstance({
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['n1'],
      variables: { n1: { sequentialIndex: 0 } },
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'n1', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'REJECTED', assignee: 'u1', createdAt: new Date() },
    ]);
    prisma.processInstance.findFirst.mockResolvedValue(instance);

    const { engine, processQueue } = createEngine();
    await engine.completeTask('t1', 'u1', 'reject', '不通过', undefined);

    expect(processQueue.add).toHaveBeenCalledTimes(1);
    expect(prisma.processTask.create).not.toHaveBeenCalled();
  });

  it('#16：节点 allowReject=false 时驳回决策被拒（此前配置从未强制）', async () => {
    const schema = makeUserTaskSchema({ approvalMode: 'single', allowReject: false });
    setupTask(schema);
    const { engine } = createEngine();

    await expect(engine.completeTask('t1', 'u1', 'reject', '不同意', undefined)).rejects.toThrow(
      '不允许驳回',
    );
    // 拦截发生在原子认领之前——任务未被置为 REJECTED
    expect(prisma.processTask.updateMany).not.toHaveBeenCalled();
  });

  it('#16：allowReject 未配置（undefined）+ 已配置驳回跳转 → 视为允许驳回', async () => {
    const schema = makeUserTaskSchema({
      approvalMode: 'single',
      rejectToNodeId: 'n2',
    });
    setupTask(schema);
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'REJECTED', assignee: 'u1', createdAt: new Date() },
    ]);
    const { engine } = createEngine();

    await engine.completeTask('t1', 'u1', 'reject', '不需要', undefined);
    expect(prisma.processTask.updateMany).toHaveBeenCalled();
  });
});

describe('R1.3 UserTaskExecutor — 多模式任务生成', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.processTask.createMany.mockResolvedValue({ count: 2 });
    prisma.processTask.create.mockResolvedValue({});
  });

  function makeCtx(nodeData: Record<string, unknown>) {
    return {
      instance: makeInstanceRow({ id: 'inst-1' }),
      node: makeNode('n1', 'user_task', nodeData),
      nodeExecutionId: 'ne-1',
      outgoingEdges: [],
      inputs: {},
      variables: {},
      tenantId: 't1',
      appId: 'app-1',
      schema: makeUserTaskSchema(nodeData),
    } as unknown as import('./types.js').ExecutionContext;
  }

  it('countersign：一次生成全部并行任务', async () => {
    const executor = new UserTaskExecutor();
    await executor.execute(
      makeCtx({ taskName: '会签', approvalMode: 'countersign', approveUsers: ['u1', 'u2'] }),
    );
    expect(prisma.processTask.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ assignee: 'u1', status: 'PENDING' }),
          expect.objectContaining({ assignee: 'u2', status: 'PENDING' }),
        ]),
      }),
    );
  });

  it('sequential：只生成当前进度位用户的单个任务', async () => {
    const executor = new UserTaskExecutor();
    const ctx = makeCtx({
      taskName: '依次',
      approvalMode: 'sequential',
      approveUsers: ['u1', 'u2'],
    });
    ctx.variables = { n1: { sequentialIndex: 1 } };
    await executor.execute(ctx);
    expect(prisma.processTask.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ assignee: 'u2' })],
      }),
    );
  });

  it('多模式 approveUsers 为空 → 报错', async () => {
    const executor = new UserTaskExecutor();
    await expect(
      executor.execute(makeCtx({ approvalMode: 'countersign', approveUsers: [] })),
    ).rejects.toThrow('approveUsers 为空');
  });

  it('single 模式无 assignee 且无 candidateGroups → 报错', async () => {
    const executor = new UserTaskExecutor();
    await expect(executor.execute(makeCtx({ taskName: 'x' }))).rejects.toThrow('无受理人');
  });
});

describe('R1.3 撤回 — withdrawInstance', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeService() {
    const engine = { cancelProcess: vi.fn().mockResolvedValue(undefined) };
    const service = new ProcessService(
      engine as unknown as ConstructorParameters<typeof ProcessService>[0],
      {} as unknown as ConstructorParameters<typeof ProcessService>[1],
      {} as unknown as ConstructorParameters<typeof ProcessService>[2],
    );
    return { service, engine };
  }

  it('非发起人撤回 → ForbiddenException', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-1',
      status: 'WAITING_USER_TASK',
      triggerContext: { triggeredByUser: 'owner-1' },
    });
    const { service } = makeService();
    await expect(service.withdrawInstance('t1', 'inst-1', 'other')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('已结束实例撤回 → BadRequestException', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-1',
      status: 'COMPLETED',
      triggerContext: { triggeredByUser: 'owner-1' },
    });
    const { service } = makeService();
    await expect(service.withdrawInstance('t1', 'inst-1', 'owner-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('发起人撤回运行中实例 → 复用 cancelProcess', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-1',
      status: 'WAITING_USER_TASK',
      triggerContext: { triggeredByUser: 'owner-1' },
    });
    const { service, engine } = makeService();
    const result = await service.withdrawInstance('t1', 'inst-1', 'owner-1');
    expect(result).toEqual({ withdrawn: true });
    expect(engine.cancelProcess).toHaveBeenCalledWith('inst-1', 't1');
  });
});

describe('R1.3 加签 — addSign', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.processTask.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'add-signer' });
    prisma.processTask.create.mockResolvedValue({});
    prisma.processDef.update.mockResolvedValue({});
  });

  function makeService(task: Record<string, unknown> | null) {
    const engine = { cancelProcess: vi.fn().mockResolvedValue(undefined) };
    const service = new ProcessService(
      engine as unknown as ConstructorParameters<typeof ProcessService>[0],
      {} as unknown as ConstructorParameters<typeof ProcessService>[1],
      {} as unknown as ConstructorParameters<typeof ProcessService>[2],
    );
    prisma.processTask.findFirst.mockResolvedValue(task);
    return { service, engine };
  }

  const baseTask = () =>
    makeProcessTask({
      id: 't1',
      status: 'PENDING',
      assignee: 'owner',
      nodeId: 'ut1',
      instance: makeProcessInstance({
        id: 'inst-1',
        variables: { ut1: { sequentialIndex: 0 } },
        processDef: makeProcessDef({
          workflowSchema: {
            nodes: [
              {
                id: 'ut1',
                type: 'user_task',
                data: { taskName: 'x', approvalMode: 'sequential', approveUsers: ['owner'] },
              },
            ],
            edges: [],
          },
        }),
      }),
    });

  it('非 PENDING 任务加签 → CONFLICT', async () => {
    const { service } = makeService(baseTask());
    prisma.processTask.findFirst.mockResolvedValue({
      ...baseTask(),
      status: 'APPROVED',
    });
    await expect(service.addSign('t1', 't1', 'owner', 'u9', 'after')).rejects.toThrow(
      '已完成或已取消',
    );
  });

  it('加签用户不存在 → VALIDATION_ERROR', async () => {
    const { service } = makeService(baseTask());
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.addSign('t1', 't1', 'owner', 'ghost', 'parallel')).rejects.toThrow(
      '加签用户不存在',
    );
  });

  it('parallel 加签 → 立即创建并行 PENDING 任务', async () => {
    const { service } = makeService(baseTask());
    const r = await service.addSign('t1', 't1', 'owner', 'add-signer', 'parallel');
    expect(r).toEqual({ added: true, position: 'parallel', assignee: 'add-signer' });
    expect(prisma.processTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignee: 'add-signer', status: 'PENDING' }),
      }),
    );
    // 并行加签不改流程定义
    expect(prisma.processDef.update).not.toHaveBeenCalled();
  });

  it('after 加签 → 插入 approveUsers 当前进度位之后并写回定义', async () => {
    const { service } = makeService(baseTask());
    const r = await service.addSign('t1', 't1', 'owner', 'add-signer', 'after');
    expect(r.added).toBe(true);
    expect(prisma.processDef.update).toHaveBeenCalledTimes(1);
    const call = prisma.processDef.update.mock.calls[0]![0] as {
      data: {
        workflowSchema: { nodes: Array<{ id: string; data: { approveUsers: string[] } }> };
      };
    };
    const node = call.data.workflowSchema.nodes.find((n) => n.id === 'ut1')!;
    expect(node.data.approveUsers).toEqual(['owner', 'add-signer']);
  });
});

describe('实例启动与查询 — startInstance/getInstance', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeService() {
    const engine = {
      startProcess: vi.fn().mockResolvedValue('inst-1'),
      cancelProcess: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProcessService(
      engine as unknown as ConstructorParameters<typeof ProcessService>[0],
      {} as unknown as ConstructorParameters<typeof ProcessService>[1],
      {} as unknown as ConstructorParameters<typeof ProcessService>[2],
    );
    return { service, engine };
  }

  it('startInstance 传递 MANUAL 触发上下文与 inputs 并回查实例详情', async () => {
    const instance = makeProcessInstance({ id: 'inst-1' });
    const { service, engine } = makeService();
    prisma.processInstance.findFirst.mockResolvedValue(instance);
    prisma.processTask.findMany.mockResolvedValue([]);

    const dto = { variables: { amount: 356000 }, triggeredByUser: 'u1' };
    await service.startInstance('t1', 'def-1', dto);

    expect(engine.startProcess).toHaveBeenCalledWith(
      't1',
      'def-1',
      expect.objectContaining({
        triggerType: 'MANUAL',
        triggeredByUser: 'u1',
        inputs: { amount: 356000 },
      }),
    );
  });
});

describe('通知模版 CRUD — update/delete', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.notificationTemplate.update.mockResolvedValue({ updatedAt: new Date() });
    prisma.notificationTemplate.delete.mockResolvedValue({});
  });

  function makeService() {
    return new ProcessService(
      { cancelProcess: vi.fn() } as unknown as ConstructorParameters<typeof ProcessService>[0],
      {} as unknown as ConstructorParameters<typeof ProcessService>[1],
      {} as unknown as ConstructorParameters<typeof ProcessService>[2],
    );
  }

  it('updateTemplate 不存在 → NotFoundException', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue(null);
    const service = makeService();
    await expect(service.updateTemplate('t1', 'tpl-404', { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateTemplate 更新名称与渠道', async () => {
    const templateRow = {
      id: 'tpl-1',
      name: '新名',
      channel: 'EMAIL',
      titleTemplate: '',
      bodyTemplate: '',
      variables: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.notificationTemplate.findFirst.mockResolvedValue(templateRow);
    const service = makeService();
    const r = await service.updateTemplate('t1', 'tpl-1', { name: '新名', channel: 'EMAIL' });
    expect(r.name).toBe('新名');
    expect(prisma.notificationTemplate.update).toHaveBeenCalled();
  });

  it('deleteTemplate 删除并返回确认', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 'tpl-1' });
    const service = makeService();
    const r = await service.deleteTemplate('t1', 'tpl-1');
    expect(r).toEqual({ deleted: true });
    expect(prisma.notificationTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
  });
});

// ---------------------------------------------------------------------------
// 审批结果自动回写（交互评审 2026-10-04 P0：反馈环三断之首）
// ---------------------------------------------------------------------------

describe('审批结果自动回写 — writeback', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.processInstance.update.mockResolvedValue({});
    prisma.processInstance.findFirst.mockImplementation((args: { where: { id: string } }) => {
      return Promise.resolve(makeInstanceRow({ id: args.where.id, status: 'WAITING_USER_TASK' }));
    });
    prisma.nodeExecution.update.mockResolvedValue({});
  });

  function setupWritebackTask(variables: Record<string, unknown>) {
    const schema = makeUserTaskSchema({
      approvalMode: 'single',
      allowReject: true,
      rejectToNodeId: 'n2',
      writeback: { field: 'status', approveValue: 'approved', rejectValue: 'rejected' },
    });
    const instance = makeProcessInstance({
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['n1'],
      variables,
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'n1', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
    ]);
    prisma.processInstance.findFirst.mockResolvedValue(instance);
  }

  it('通过：按 approveValue 回写触发记录字段', async () => {
    setupWritebackTask({ recordId: 'rec-1', objectId: 'obj-1' });
    const { engine, processQueue, recordService } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    expect(recordService.update).toHaveBeenCalledWith('tenant-001', 'rec-1', 'u1', {
      status: 'approved',
    });
    // 审批推进不受回写影响
    expect(processQueue.add).toHaveBeenCalledTimes(1);
  });

  it('驳回：按 rejectValue 回写', async () => {
    setupWritebackTask({ recordId: 'rec-1', objectId: 'obj-1' });
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'REJECTED', assignee: 'u1', createdAt: new Date() },
    ]);
    const { engine, recordService } = createEngine();
    await engine.completeTask('t1', 'u1', 'reject', '不同意', undefined);

    expect(recordService.update).toHaveBeenCalledWith('tenant-001', 'rec-1', 'u1', {
      status: 'rejected',
    });
  });

  it('非记录触发（无 recordId）：跳过回写但正常推进', async () => {
    setupWritebackTask({});
    const { engine, processQueue, recordService } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    expect(recordService.update).not.toHaveBeenCalled();
    expect(processQueue.add).toHaveBeenCalledTimes(1);
  });

  it('未配置 writeback：不回写', async () => {
    const schema = makeUserTaskSchema({ approvalMode: 'single', allowReject: true });
    const instance = makeProcessInstance({
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['n1'],
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'n1', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processInstance.findFirst.mockResolvedValue(instance);
    prisma.processTask.findMany.mockResolvedValue([
      { id: 't1', status: 'APPROVED', assignee: 'u1', createdAt: new Date() },
    ]);
    const { engine, recordService } = createEngine();
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    expect(recordService.update).not.toHaveBeenCalled();
  });

  it('回写失败：不阻断审批推进（记录错误后照常入队）', async () => {
    setupWritebackTask({ recordId: 'rec-1', objectId: 'obj-1' });
    const { engine, processQueue, recordService } = createEngine();
    (recordService.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('字段已删除'));
    await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

    expect(recordService.update).toHaveBeenCalled();
    expect(processQueue.add).toHaveBeenCalledTimes(1);
  });
});
