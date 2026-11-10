/**
 * ProcessEngine 单元测试 — 状态机执行内核。
 *
 * 测试覆盖：
 * - 启动流程实例（startProcess / startProcessByDefId）
 * - token 流推进（executeNextNode）
 * - 节点执行（executeNode）
 * - 完成人工任务（completeTask）
 * - 取消流程（cancelProcess）
 * - 延时节点恢复（resumeDelayedNode）
 * - PE-17 节点完成+路由+推进原子化 / PE-13 失败重试语义与恢复
 * - Schema 导航辅助（findNode / getOutgoingEdges / resolveNextNodes）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProcessEngine } from './process-engine.js';
import type { NodeExecutor } from './types.js';
import type { WorkflowSchema, WorkflowNode } from '@apaas/shared';
import {
  getMockPrisma,
  getMockTransaction,
  createMockQueue,
  createMockExecutor,
} from '../test/test-helpers.js';
import {
  makeProcessDef,
  makeProcessInstance,
  makeProcessTask,
  makeNodeExecution,
  makeSimpleSchema,
} from '../test/mock-factories.js';

// ---------------------------------------------------------------------------
// Mock 依赖
// ---------------------------------------------------------------------------

/** 创建 mock NodeExecutorRegistry，按 type → executor 映射。 */
function createMockRegistry(executors: NodeExecutor[]) {
  const map = new Map(executors.map((e) => [e.type, e]));
  return {
    get: vi.fn((type: string) => {
      const executor = map.get(type);
      if (!executor) {
        throw new BadRequestException({
          code: 'unsupported_node_type',
          message: `未注册的节点类型: ${type}`,
        });
      }
      return executor;
    }),
  };
}

/** 创建 mock InAppMessageService。 */
function createMockInAppMessageService() {
  return { create: vi.fn().mockResolvedValue(undefined) };
}

/** 构造 ProcessEngine 实例（注入 mock 依赖）。 */
function createEngine(executors: NodeExecutor[] = []) {
  const registry = createMockRegistry(executors);
  const inAppMessageService = createMockInAppMessageService();
  const processQueue = createMockQueue();
  const delayQueue = createMockQueue();
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
    {
      update: vi.fn().mockResolvedValue({ id: 'record-mock' }),
    } as unknown as ConstructorParameters<typeof ProcessEngine>[6],
  );
  return { engine, registry, inAppMessageService, processQueue, delayQueue };
}

// 辅助：构造 WorkflowNode
function makeNode(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, meta: {}, data } as WorkflowNode;
}

// 辅助：构造 InstanceRow（带 processDef 关联）
function makeInstanceRow(overrides: Record<string, unknown> = {}) {
  const inst = makeProcessInstance(overrides);
  return inst as unknown as import('./types.js').InstanceRow;
}

describe('ProcessEngine', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    // 默认 mock：processInstance.update 返回实例自身
    prisma.processInstance.update.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        ...makeProcessInstance(),
        ...args.data,
      }),
    );
  });

  // =========================================================================
  // startProcess
  // =========================================================================

  describe('startProcess', () => {
    it('流程未发布时抛出 BadRequestException', async () => {
      prisma.processDef.findFirst.mockResolvedValue(null);
      const { engine } = createEngine();

      await expect(engine.startProcess('tenant-001', 'pd-001', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('缺少 start 节点时抛出 BadRequestException', async () => {
      prisma.processDef.findFirst.mockResolvedValue(
        makeProcessDef({
          workflowSchema: { nodes: [], edges: [] } as WorkflowSchema,
        }),
      );
      const { engine } = createEngine();

      await expect(engine.startProcess('tenant-001', 'pd-001', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('正常启动 — 创建实例并入队', async () => {
      const schema = makeSimpleSchema();
      prisma.processDef.findFirst.mockResolvedValue(makeProcessDef({ workflowSchema: schema }));
      prisma.processInstance.create.mockResolvedValue(makeProcessInstance());
      const { engine, processQueue } = createEngine();

      const instanceId = await engine.startProcess('tenant-001', 'pd-001', {
        inputs: { amount: 5000 },
      });

      expect(instanceId).toBe('pi-001');
      expect(prisma.processInstance.create).toHaveBeenCalledTimes(1);
      // 输入变量应展开到 variables 顶层
      const createCall = prisma.processInstance.create.mock.calls[0]![0];
      expect(createCall.data.variables).toMatchObject({ amount: 5000 });
      expect(createCall.data.status).toBe('RUNNING');
      expect(createCall.data.activeNodeIds).toEqual(['node-start']);
      // 应异步入队
      expect(processQueue.add).toHaveBeenCalledWith(
        'execute',
        { instanceId: 'pi-001' },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('triggerContext 无 inputs 字段时，变量直接展开 triggerContext', async () => {
      const schema = makeSimpleSchema();
      prisma.processDef.findFirst.mockResolvedValue(makeProcessDef({ workflowSchema: schema }));
      prisma.processInstance.create.mockResolvedValue(makeProcessInstance());
      const { engine } = createEngine();

      await engine.startProcess('tenant-001', 'pd-001', { trigger: 'MANUAL', value: 42 });

      const createCall = prisma.processInstance.create.mock.calls[0]![0];
      expect(createCall.data.variables).toMatchObject({ trigger: 'MANUAL', value: 42 });
    });
  });

  // =========================================================================
  // startProcessByDefId
  // =========================================================================

  describe('startProcessByDefId', () => {
    it('流程定义不存在时抛出 BadRequestException', async () => {
      prisma.processDef.findFirst.mockResolvedValue(null);
      const { engine } = createEngine();

      await expect(engine.startProcessByDefId('missing-id', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('加载流程定义后委托 startProcess', async () => {
      const schema = makeSimpleSchema();
      // 第一次调用 findFirst（startProcessByDefId 的 select 查询）
      prisma.processDef.findFirst
        .mockResolvedValueOnce(makeProcessDef({ id: 'pd-001', tenantId: 'tenant-001' }))
        // 第二次调用 findFirst（startProcess 内部的完整查询）
        .mockResolvedValueOnce(makeProcessDef({ workflowSchema: schema }));
      prisma.processInstance.create.mockResolvedValue(makeProcessInstance());
      const { engine, processQueue } = createEngine();

      const instanceId = await engine.startProcessByDefId('pd-001', {});

      expect(instanceId).toBe('pi-001');
      expect(processQueue.add).toHaveBeenCalledWith(
        'execute',
        { instanceId: 'pi-001' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  // =========================================================================
  // executeNextNode
  // =========================================================================

  describe('executeNextNode', () => {
    it('实例不存在时抛出 NotFoundException', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(null);
      const { engine } = createEngine();

      await expect(engine.executeNextNode('missing')).rejects.toThrow(NotFoundException);
    });

    it('实例状态非 RUNNING 时跳过执行', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(
        makeProcessInstance({ status: 'COMPLETED', activeNodeIds: [] }),
      );
      const { engine } = createEngine();

      await engine.executeNextNode('pi-001');

      // 不应创建任何 NodeExecution
      expect(prisma.nodeExecution.create).not.toHaveBeenCalled();
    });

    it('start → end 直连流程正常完成', async () => {
      const schema = makeSimpleSchema();
      const startExecutor = createMockExecutor('start', async () => ({
        output: {},
        wait: false,
      }));
      const endExecutor = createMockExecutor('end', async () => ({
        output: {},
        wait: false,
      }));

      // 模拟实例加载
      const instance = makeProcessInstance({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      // nodeExecution.create 返回
      prisma.nodeExecution.create.mockResolvedValue(makeNodeExecution());
      // $transaction 默认实现已由 setup 提供（Promise.all）
      // advanceTokens 中的 update 返回更新后的实例
      const currentActiveNodes = ['node-start'];
      prisma.processInstance.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...instance,
          ...args.data,
          activeNodeIds: (args.data.activeNodeIds as string[]) ?? currentActiveNodes,
        }),
      );

      const { engine } = createEngine([startExecutor, endExecutor]);

      await engine.executeNextNode('pi-001');

      // start executor 应被执行
      expect(startExecutor.execute).toHaveBeenCalledTimes(1);
      // 最终实例应被标记为 COMPLETED
      const finalUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'COMPLETED',
      );
      expect(finalUpdate).toBeDefined();
    });

    it('节点返回 wait=true 时暂停实例', async () => {
      const schema = makeSimpleSchema();
      // start 节点返回 wait=true（模拟 UserTask）
      const startExecutor = createMockExecutor('start', async () => ({
        output: { taskCreated: true },
        wait: true,
      }));

      const instance = makeProcessInstance({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.nodeExecution.create.mockResolvedValue(makeNodeExecution());

      const { engine } = createEngine([startExecutor]);

      await engine.executeNextNode('pi-001');

      // 应将实例状态设为 WAITING_USER_TASK
      const waitUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'WAITING_USER_TASK',
      );
      expect(waitUpdate).toBeDefined();
    });

    it('活跃节点不存在于 Schema 时移除令牌', async () => {
      const schema = makeSimpleSchema(); // 只有 node-start 和 node-end
      const instance = makeProcessInstance({
        activeNodeIds: ['nonexistent-node'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.processInstance.update.mockResolvedValue(
        makeProcessInstance({
          activeNodeIds: [],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      );

      const { engine } = createEngine();

      await engine.executeNextNode('pi-001');

      // 应更新 activeNodeIds 移除不存在的节点
      const removeCall = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) =>
          Array.isArray(call[0]!.data.activeNodeIds) &&
          (call[0]!.data.activeNodeIds as string[]).length === 0,
      );
      expect(removeCall).toBeDefined();
    });

    it('B3 循环预算：历史节点执行次数超上限时实例置 FAILED', async () => {
      const schema = makeSimpleSchema();
      const instance = makeProcessInstance({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      // 模拟历史已执行 1001 次（超过 MAX_NODE_EXECUTIONS=1000）
      prisma.nodeExecution.count.mockResolvedValue(1001);

      const { engine } = createEngine();

      await engine.executeNextNode('pi-001');

      // 实例应被标记 FAILED 且携带循环检测错误信息
      const failedUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedUpdate).toBeDefined();
      expect(String(failedUpdate![0]!.data.error)).toContain('循环执行');
    });

    it('B4 WAITING 令牌跳过：所有令牌等待时不执行节点', async () => {
      const schema = makeSimpleSchema();
      const startExecutor = createMockExecutor('start', async () => ({
        output: {},
        completed: true,
      }));
      const instance = makeProcessInstance({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      // 该节点的 NodeExecution 处于 WAITING（延时/人工等待中）
      prisma.nodeExecution.findMany.mockResolvedValue([{ nodeId: 'node-start' }]);

      const { engine } = createEngine([startExecutor]);

      await engine.executeNextNode('pi-001');

      // 不应执行任何节点（避免重复调度延时 job / 重复推进）
      expect(startExecutor.execute).not.toHaveBeenCalled();
    });

    it('B4 WAITING 令牌跳过：等待令牌存在时执行第一个非等待令牌', async () => {
      const schema = makeSimpleSchema();
      const startExecutor = createMockExecutor('start', async () => ({
        output: {},
        completed: true,
      }));
      const endExecutor = createMockExecutor('end', async () => ({
        output: {},
        completed: true,
      }));
      const instance = makeProcessInstance({
        activeNodeIds: ['node-waiting', 'node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      // 只有 node-waiting 处于 WAITING
      prisma.nodeExecution.findMany.mockResolvedValue([{ nodeId: 'node-waiting' }]);
      prisma.nodeExecution.create.mockResolvedValue(makeNodeExecution());
      prisma.processInstance.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...instance,
          ...args.data,
        }),
      );

      const { engine } = createEngine([startExecutor, endExecutor]);

      await engine.executeNextNode('pi-001');

      // start executor 应被执行（跳过 WAITING 的 node-waiting）
      expect(startExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // completeTask
  // =========================================================================

  describe('completeTask', () => {
    it('任务不存在时抛出 NotFoundException', async () => {
      prisma.processTask.findFirst.mockResolvedValue(null);
      const { engine } = createEngine();

      await expect(
        engine.completeTask('missing', 'user-001', 'approve', undefined, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('任务已被处理时 409 冲突拒绝（PE-12 批 7③：认领冲突与定论守卫同族 409，原 400 随认领入锁改写）', async () => {
      prisma.processTask.findFirst.mockResolvedValue(makeProcessTask({ status: 'APPROVED' }));
      // 原子认领失败（count=0）→ 任务已被处理；复验 findUnique 为 null（无同决策续用）
      prisma.processTask.updateMany.mockResolvedValue({ count: 0 });
      prisma.processTask.findUnique.mockResolvedValue(null);
      // 认领在锁内：锁内实例重载需返回实例行
      prisma.processInstance.findFirst.mockResolvedValue(makeProcessInstance());
      const { engine } = createEngine();

      await expect(
        engine.completeTask('task-001', 'user-001', 'approve', undefined, undefined),
      ).rejects.toThrow(ConflictException);
    });

    it('审批通过 — 更新任务 + 恢复实例 + 入队', async () => {
      const schema = makeSimpleSchema({
        nodes: [makeNode('node-task', 'user_task'), makeNode('node-end', 'end')],
        edges: [{ sourceNodeID: 'node-task', targetNodeID: 'node-end' }],
      });
      const instance = makeProcessInstance({
        activeNodeIds: ['node-task'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      const task = makeProcessTask({ nodeId: 'node-task', instance });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
      // B2: 锁内重载实例
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.processInstance.update.mockResolvedValue(
        makeProcessInstance({ status: 'RUNNING', activeNodeIds: ['node-end'] }),
      );

      const { engine, processQueue } = createEngine();

      await engine.completeTask('task-001', 'user-001', 'approve', '同意', undefined);

      // 任务状态应为 APPROVED（原子认领 updateMany）
      const taskUpdate = prisma.processTask.updateMany.mock.calls[0]![0];
      expect(taskUpdate.data.status).toBe('APPROVED');
      expect(taskUpdate.data.decision).toBe('APPROVE');
      expect(taskUpdate.data.comment).toBe('同意');
      expect(taskUpdate.where).toEqual({ id: 'task-001', status: 'PENDING' });
      // 实例应恢复为 RUNNING
      const instUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'RUNNING',
      );
      expect(instUpdate).toBeDefined();
      // 应入队继续执行
      expect(processQueue.add).toHaveBeenCalledWith(
        'execute',
        { instanceId: 'pi-001' },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('驳回且有 rejectToNodeId — 跳回指定节点', async () => {
      const schema = makeSimpleSchema({
        nodes: [
          makeNode('node-task', 'user_task', { rejectToNodeId: 'node-back' }),
          makeNode('node-back', 'assign'),
          makeNode('node-end', 'end'),
        ],
        edges: [
          { sourceNodeID: 'node-task', targetNodeID: 'node-end' },
          { sourceNodeID: 'node-back', targetNodeID: 'node-task' },
        ],
      });
      const instance = makeProcessInstance({
        activeNodeIds: ['node-task'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      const task = makeProcessTask({ nodeId: 'node-task', instance });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
      // B2: 锁内重载实例
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.processInstance.update.mockResolvedValue(makeProcessInstance({ status: 'RUNNING' }));

      const { engine } = createEngine();

      await engine.completeTask('task-001', 'user-001', 'reject', '驳回', undefined);

      // 实例 activeNodeIds 应包含 node-back
      const instUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'RUNNING',
      );
      expect(instUpdate).toBeDefined();
      expect(instUpdate![0]!.data.activeNodeIds).toContain('node-back');
    });

    it('兼容 approve 和 approved 两种写法', async () => {
      const schema = makeSimpleSchema({
        nodes: [makeNode('node-task', 'user_task'), makeNode('node-end', 'end')],
        edges: [{ sourceNodeID: 'node-task', targetNodeID: 'node-end' }],
      });

      for (const decision of ['approve', 'approved', 'APPROVE', 'APPROVED']) {
        const instance = makeProcessInstance({
          activeNodeIds: ['node-task'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        });
        const task = makeProcessTask({ nodeId: 'node-task', instance });
        prisma.processTask.findFirst.mockResolvedValue(task);
        prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
        // B2: 锁内重载实例
        prisma.processInstance.findFirst.mockResolvedValue(instance);
        prisma.processInstance.update.mockResolvedValue(makeProcessInstance());

        const { engine } = createEngine();
        await engine.completeTask('task-001', 'user-001', decision, undefined, undefined);

        const taskUpdate = prisma.processTask.updateMany.mock.calls.at(-1)![0];
        expect(taskUpdate.data.status).toBe('APPROVED');
      }
    });

    it('R5.5 回归：决策顶层规范别名 — {"var":"decision"} 条件边真实路由', async () => {
      // 修复前双层断裂（实测 2026-10-09）：
      // ① 决策仅存节点命名空间（<nodeId>.output.decision），顶层 {"var":"decision"}
      //    恒 undefined → 条件边全不匹配；
      // ② 注入原样大写串（传 approve → APPROVE），按方言指南写 APPROVED 的边恒 false。
      // 两者叠加：任务完成 → nextNodeIds=[] → 令牌静默终结（实例 COMPLETED
      // 零回写零通知）。修复后：顶层注入规范值 APPROVED/REJECTED，指南契约成真。
      const schema = makeSimpleSchema({
        nodes: [
          makeNode('node-task', 'user_task'),
          makeNode('node-small', 'notification'),
          makeNode('node-big', 'user_task'),
          makeNode('node-end', 'end'),
        ],
        edges: [
          {
            sourceNodeID: 'node-task',
            targetNodeID: 'node-small',
            condition: {
              and: [
                { '==': [{ var: 'decision' }, 'APPROVED'] },
                { '<': [{ var: 'amount' }, 1000] },
              ],
            },
          },
          {
            sourceNodeID: 'node-task',
            targetNodeID: 'node-big',
            condition: {
              and: [
                { '==': [{ var: 'decision' }, 'APPROVED'] },
                { '>=': [{ var: 'amount' }, 1000] },
              ],
            },
          },
        ],
      });
      const instance = makeProcessInstance({
        activeNodeIds: ['node-task'],
        variables: { amount: 5000 },
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      const task = makeProcessTask({ nodeId: 'node-task', instance });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
      // B2: 锁内重载实例
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.processInstance.update.mockResolvedValue(makeProcessInstance({ status: 'RUNNING' }));

      const { engine } = createEngine();
      // 调用方传非规范输入 approve——引擎应规范化后路由
      await engine.completeTask('task-001', 'user-001', 'approve', '同意转复核', undefined);

      const instUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'RUNNING',
      );
      expect(instUpdate).toBeDefined();
      // 大额边真实匹配 → 复核节点激活（修复前：activeNodeIds 为空，实例终结）
      expect(instUpdate![0]!.data.activeNodeIds).toContain('node-big');
      // 顶层规范别名可被后续边条件消费
      expect((instUpdate![0]!.data.variables as Record<string, unknown>)['decision']).toBe(
        'APPROVED',
      );
    });

    it('B2: 并发双 completeTask 同实例不同任务 — 令牌不丢失', async () => {
      // 模拟并行分支：实例有两个活跃节点 node-a / node-b，
      // 两个任务分别完成这两个节点。
      // 修复前：两个任务锁外都读到 [node-a, node-b]，后写入者覆盖先写入者 → 令牌丢失。
      // 修复后：锁内重载实例，第二个任务读到第一个任务写入后的 activeNodeIds。
      const schema = makeSimpleSchema({
        nodes: [
          makeNode('node-a', 'user_task'),
          makeNode('node-b', 'user_task'),
          makeNode('node-end-a', 'end'),
          makeNode('node-end-b', 'end'),
        ],
        edges: [
          { sourceNodeID: 'node-a', targetNodeID: 'node-end-a' },
          { sourceNodeID: 'node-b', targetNodeID: 'node-end-b' },
        ],
      });

      const taskA = makeProcessTask({
        id: 'task-a',
        nodeId: 'node-a',
        instance: makeProcessInstance({
          id: 'pi-concurrent',
          activeNodeIds: ['node-a', 'node-b'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      });
      const taskB = makeProcessTask({
        id: 'task-b',
        nodeId: 'node-b',
        instance: makeProcessInstance({
          id: 'pi-concurrent',
          activeNodeIds: ['node-a', 'node-b'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      });

      // 模拟锁内重载：第一次返回原始状态（node-a + node-b），
      // 第二次返回 taskA 写入后的状态（node-b + node-end-a）
      let findFirstCallCount = 0;
      prisma.processInstance.findFirst.mockImplementation(() => {
        findFirstCallCount++;
        if (findFirstCallCount === 1) {
          // taskA 锁内重载：原始状态
          return Promise.resolve(
            makeProcessInstance({
              id: 'pi-concurrent',
              activeNodeIds: ['node-a', 'node-b'],
              processDef: makeProcessDef({ workflowSchema: schema }),
            }),
          );
        }
        // taskB 锁内重载：taskA 已写入 — node-b 仍在 + node-end-a 新增
        return Promise.resolve(
          makeProcessInstance({
            id: 'pi-concurrent',
            activeNodeIds: ['node-b', 'node-end-a'],
            processDef: makeProcessDef({ workflowSchema: schema }),
          }),
        );
      });

      // taskA 先执行
      prisma.processTask.findFirst.mockResolvedValueOnce(taskA);
      prisma.processTask.updateMany.mockResolvedValueOnce({ count: 1 });

      // taskA 的 instance.update 返回包含 node-end-a 的状态
      prisma.processInstance.update.mockResolvedValueOnce(
        makeProcessInstance({
          id: 'pi-concurrent',
          activeNodeIds: ['node-b', 'node-end-a'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      );

      const { engine } = createEngine();
      await engine.completeTask('task-a', 'user-001', 'approve', undefined, undefined);

      // taskB 后执行
      prisma.processTask.findFirst.mockResolvedValueOnce(taskB);
      prisma.processTask.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.processInstance.update.mockResolvedValueOnce(
        makeProcessInstance({
          id: 'pi-concurrent',
          activeNodeIds: ['node-end-a', 'node-end-b'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      );

      await engine.completeTask('task-b', 'user-001', 'approve', undefined, undefined);

      // taskB 的 update 调用应同时包含 node-end-a（taskA 的下游）和 node-end-b（taskB 的下游）
      // 修复前 taskB 读到 [node-a, node-b] → 写入 [node-a, node-end-b]，丢失 node-end-a
      const lastUpdate = prisma.processInstance.update.mock.calls.at(-1)![0];
      expect(lastUpdate.data.activeNodeIds).toContain('node-end-a');
      expect(lastUpdate.data.activeNodeIds).toContain('node-end-b');
    });
  });

  // =========================================================================
  // cancelProcess
  // =========================================================================

  it('P1-06：实例已取消时 sequential 推进被拒绝（锁内状态校验，不产生幽灵任务）', async () => {
    // 缺陷：sequential 推进（读进度→写变量→create 下一环任务）在实例锁外直连——
    // 与 cancelProcess 并发时实例已 TERMINATED 仍生成 PENDING 任务（实测 7/20 幽灵）。
    // 修复契约：推进包 withInstanceLock 且锁内校验实例状态（对齐主审批路径 P1-2/B2）。
    const schema = makeSimpleSchema({
      nodes: [
        makeNode('node-task', 'user_task', {
          approvalMode: 'sequential',
          approveUsers: ['u1', 'u2'],
        }),
        makeNode('node-end', 'end'),
      ],
      edges: [{ sourceNodeID: 'node-task', targetNodeID: 'node-end' }],
    });
    const instance = makeProcessInstance({
      activeNodeIds: ['node-task'],
      status: 'RUNNING',
      variables: { 'node-task': { sequentialIndex: 0 } },
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'node-task', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processTask.count.mockResolvedValue(0);
    prisma.processTask.findMany.mockResolvedValue([task]);
    // 锁内重载：实例已被取消
    prisma.processInstance.findFirst.mockResolvedValue({
      ...instance,
      status: 'TERMINATED',
    });

    const { engine } = createEngine();
    await expect(
      engine.completeTask('task-001', 'u1', 'approve', undefined, undefined),
    ).rejects.toThrow(ConflictException);

    // 不得创建下一环任务、不得推进 sequentialIndex
    expect(prisma.processTask.create).not.toHaveBeenCalled();
    const varUpdate = prisma.processInstance.update.mock.calls.find(
      (call: { data: Record<string, unknown> }[]) =>
        'variables' in (call[0]!.data as Record<string, unknown>),
    );
    expect(varUpdate).toBeUndefined();
  });

  it('P1-14：依次审批第 2..N 环任务生成后重挂超时 job（S1 通道）', async () => {
    // 缺陷：第 1 环完成时 remainingPending=0 触发 cancelTaskTimeout 移除批次 job，
    // 随后 sequential 分支直连 create 下一环任务（不经执行器）→ 2..N 环零超时覆盖。
    // 修复契约：下一环任务生成后按节点 dueDate/dueUnit/timeoutAction 重挂同批次 job。
    const schema = makeSimpleSchema({
      nodes: [
        makeNode('node-task', 'user_task', {
          approvalMode: 'sequential',
          approveUsers: ['u1', 'u2'],
          dueDate: 15,
          dueUnit: 'SECONDS',
          timeoutAction: 'AUTO_APPROVE',
        }),
        makeNode('node-end', 'end'),
      ],
      edges: [{ sourceNodeID: 'node-task', targetNodeID: 'node-end' }],
    });
    const instance = makeProcessInstance({
      activeNodeIds: ['node-task'],
      variables: { 'node-task': { sequentialIndex: 0 } },
      processDef: makeProcessDef({ workflowSchema: schema }),
    });
    const task = makeProcessTask({ nodeId: 'node-task', instance });
    prisma.processTask.findFirst.mockResolvedValue(task);
    prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
    prisma.processTask.count.mockResolvedValue(0);
    prisma.processTask.findMany.mockResolvedValue([task]);
    prisma.processTask.create.mockResolvedValue({ ...task, id: 'task-002' });
    // P1-06：锁内重载实例（状态正常）
    prisma.processInstance.findFirst.mockResolvedValue(instance);
    // PE-16：环内校验需下一环审批人真实存在（2026-11-10 契约）
    prisma.user.findFirst.mockResolvedValue({ id: 'u2' });

    const { engine, delayQueue } = createEngine();
    await engine.completeTask('task-001', 'u1', 'approve', undefined, undefined);

    // 下一环任务已生成
    expect(prisma.processTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignee: 'u2', status: 'PENDING' }),
      }),
    );
    // 超时 job 重挂（同 nodeExecutionId 幂等 jobId，delay=15s）
    expect(delayQueue.add).toHaveBeenCalledWith(
      'task_timeout',
      {
        kind: 'task_timeout',
        instanceId: 'pi-001',
        nodeId: 'node-task',
        nodeExecutionId: 'ne-001',
      },
      expect.objectContaining({ delay: 15_000, jobId: 'task-timeout-ne-001-seq1' }),
    );
  });

  describe('cancelProcess', () => {
    it('实例不存在时抛出 NotFoundException', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(null);
      const { engine } = createEngine();

      await expect(engine.cancelProcess('missing')).rejects.toThrow(NotFoundException);
    });

    it('正常取消 — 终止待办任务 + 实例置 TERMINATED', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(makeProcessInstance());
      prisma.processTask.updateMany.mockResolvedValue({ count: 3 });
      prisma.processInstance.update.mockResolvedValue(
        makeProcessInstance({ status: 'TERMINATED' }),
      );

      const { engine } = createEngine();
      await engine.cancelProcess('pi-001');

      // 取消所有 PENDING 任务
      expect(prisma.processTask.updateMany).toHaveBeenCalledWith({
        where: { instanceId: 'pi-001', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      // 实例状态
      const instUpdate = prisma.processInstance.update.mock.calls[0]![0];
      expect(instUpdate.where).toEqual({ id: 'pi-001' });
      expect(instUpdate.data.status).toBe('TERMINATED');
    });
  });

  // =========================================================================
  // resumeDelayedNode
  // =========================================================================

  describe('resumeDelayedNode', () => {
    it('实例不存在时抛出 NotFoundException', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(null);
      const { engine } = createEngine();

      await expect(engine.resumeDelayedNode('missing', 'node-delay')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('实例状态非 RUNNING 且非 WAITING_USER_TASK 时跳过', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(
        makeProcessInstance({ status: 'COMPLETED' }),
      );
      const { engine } = createEngine();

      await engine.resumeDelayedNode('pi-001', 'node-delay');

      // 不应有任何 update 操作
      expect(prisma.nodeExecution.updateMany).not.toHaveBeenCalled();
    });

    it('正常恢复 — 标记 NodeExecution COMPLETED + 推进令牌 + 入队', async () => {
      const schema = makeSimpleSchema({
        nodes: [makeNode('node-delay', 'delay'), makeNode('node-end', 'end')],
        edges: [{ sourceNodeID: 'node-delay', targetNodeID: 'node-end' }],
      });
      const instance = makeProcessInstance({
        status: 'WAITING_USER_TASK',
        activeNodeIds: ['node-delay'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.nodeExecution.updateMany.mockResolvedValue({ count: 1 });
      prisma.processInstance.update.mockResolvedValue(
        makeProcessInstance({ status: 'RUNNING', activeNodeIds: ['node-end'] }),
      );

      const { engine, processQueue } = createEngine();

      await engine.resumeDelayedNode('pi-001', 'node-delay');

      // NodeExecution 应标记为 COMPLETED
      expect(prisma.nodeExecution.updateMany).toHaveBeenCalledWith({
        where: { instanceId: 'pi-001', nodeId: 'node-delay', status: 'WAITING' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      // 实例状态恢复为 RUNNING
      const runningUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'RUNNING',
      );
      expect(runningUpdate).toBeDefined();
      // 入队继续执行
      expect(processQueue.add).toHaveBeenCalledWith(
        'execute',
        { instanceId: 'pi-001' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  // =========================================================================
  // executeNode — 错误处理
  // =========================================================================

  describe('executeNode error handling', () => {
    it('P1-15：error 出边 label 归一匹配（大小写/首尾空白不敏感）+ PE-17 路由与推进原子提交', async () => {
      // 缺陷：label 按 === 'error' | '失败' 字面首匹配——'Error'/'ERROR'/' Error ' 均
      // 不命中 → 实例静默 FAILED。修复契约：trim + 小写归一后匹配。
      // PE-17 改写（红线 1 理由=工单契约本身）：行 FAILED+路由留痕+令牌推进由调用方
      // 单事务原子提交——原「行 FAILED 先落、推进后行」的两段窗口不复存在。
      const schema = makeSimpleSchema({
        nodes: [makeNode('node-start', 'start'), makeNode('node-notify', 'notification')],
        edges: [{ sourceNodeID: 'node-start', targetNodeID: 'node-notify', label: ' Error ' }],
      });
      const failingExecutor = createMockExecutor('start', async () => {
        throw new Error('Executor boom');
      });
      const notifyExecutor = createMockExecutor('notification', async () => ({
        output: {},
        wait: true,
      }));

      const instance = makeInstanceRow({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.nodeExecution.create.mockResolvedValue(makeNodeExecution());

      const { engine } = createEngine([failingExecutor, notifyExecutor]);
      await engine.executeNextNode('pi-001');

      // error 分支令牌已推进（notify 执行器被调用 = 推进发生）
      expect(failingExecutor.execute).toHaveBeenCalledTimes(1);
      expect(notifyExecutor.execute).toHaveBeenCalledTimes(1);
      // 路由留痕：NodeExecution FAILED 行带 _routing（原子事务内提交）
      const failedUpdate = prisma.nodeExecution.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate![0]!.data.output).toEqual(
        expect.objectContaining({
          _routing: { nextNodeIds: ['node-notify'], at: expect.any(String) },
        }),
      );
      // S2 语义保持：实例不失败，落在 error 分支等待（notify wait=true）
      const instFailedUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(instFailedUpdate).toBeUndefined();
    });

    it('PE-13：无 error 出边执行器异常——执行行 FAILED 留痕、实例保持 RUNNING 交重试', async () => {
      // PE-13 改写（红线 1 理由=工单契约本身）：原「实例先行置 FAILED」使 BullMQ
      // attempts:3 重试进门即非 RUNNING 早退全部空转——瞬时依赖失败=审批永久失败。
      // 新契约：行 FAILED 留痕（attempt 记录）、实例保持 RUNNING、异常上抛交重试。
      const schema = makeSimpleSchema();
      const failingExecutor = createMockExecutor('start', async () => {
        throw new Error('Executor boom');
      });

      const instance = makeInstanceRow({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.nodeExecution.create.mockResolvedValue(makeNodeExecution());

      const { engine } = createEngine([failingExecutor]);

      await expect(
        engine.executeNode(instance, makeNode('node-start', 'start'), schema, {}),
      ).rejects.toThrow('Executor boom');

      // NodeExecution 应被标记为 FAILED（attempt 留痕）
      const failedUpdate = prisma.nodeExecution.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate![0]!.data.error).toBe('Executor boom');

      // 实例不置 FAILED（交由 BullMQ 重试 / processor 耗尽后 final-failure 处置）
      const instFailedUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(instFailedUpdate).toBeUndefined();
    });
  });

  // =========================================================================
  // PE-17/PE-13 — 节点执行原子性与失败重试语义（R-B 波次④⑤合并批）
  // =========================================================================

  describe('PE-17/PE-13 节点执行原子性与失败重试语义', () => {
    beforeEach(() => {
      prisma.nodeExecution.count.mockResolvedValue(0);
      prisma.nodeExecution.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: `ne-${Math.random().toString(36).slice(2, 8)}`,
          ...args.data,
        }),
      );
    });

    /** 构造 start→end 直连流程实例 mock（findFirst 返回同一实例行）。 */
    function setupStartEnd() {
      const schema = makeSimpleSchema();
      const instance = makeInstanceRow({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.processInstance.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({ ...instance, ...args.data }),
      );
      return schema;
    }

    it('PE-17：节点完成+路由留痕+令牌推进单事务原子提交（无 COMPLETED 未推进中间态）', async () => {
      const schema = setupStartEnd();
      const startExecutor = createMockExecutor('start', async () => ({
        output: { ok: 1 },
        wait: false,
      }));
      const endExecutor = createMockExecutor('end', async () => ({ output: {}, wait: false }));

      // 事务调用时快照：行更新与实例更新必须发生在同一次 $transaction 内
      const tx = getMockTransaction();
      let txRowCalls = -1;
      let txInstCalls = -1;
      tx.mockImplementationOnce((arg: unknown) => {
        txRowCalls = prisma.nodeExecution.update.mock.calls.length;
        txInstCalls = prisma.processInstance.update.mock.calls.length;
        return Array.isArray(arg)
          ? Promise.all(arg as unknown[])
          : (arg as (p: unknown) => Promise<unknown>)(prisma);
      });

      const { engine } = createEngine([startExecutor, endExecutor]);
      await engine.executeNextNode('pi-001');

      expect(startExecutor.execute).toHaveBeenCalledTimes(1);
      // 事务时刻：完成行更新与令牌推进均已入栈（同一次提交）
      expect(txRowCalls).toBe(1);
      expect(txInstCalls).toBe(1);
      // 完成行携带路由留痕（原实现 _routing 由推进前独立的 updateMany 写入——两段写）
      const rowUpdate = prisma.nodeExecution.update.mock.calls[0]![0]! as {
        data: Record<string, unknown>;
      };
      expect(rowUpdate.data.status).toBe('COMPLETED');
      expect(rowUpdate.data.output).toEqual(
        expect.objectContaining({
          _routing: { nextNodeIds: ['node-end'], at: expect.any(String) },
        }),
      );
      // 令牌推进在同一事务（start → end）
      const tokenUpdate = prisma.processInstance.update.mock.calls[0]![0]! as {
        data: Record<string, unknown>;
      };
      expect(tokenUpdate.data.activeNodeIds).toEqual(['node-end']);
      expect(schema).toBeDefined();
    });

    it('PE-17：提交窗口失败零部分持久化——行/实例均未写，重试整节点重执行（at-least-once 显式登记）', async () => {
      setupStartEnd();
      const startExecutor = createMockExecutor('start', async () => ({
        output: { ok: true },
        wait: false,
      }));
      const endExecutor = createMockExecutor('end', async () => ({ output: {}, wait: false }));

      const tx = getMockTransaction();
      tx.mockRejectedValueOnce(new Error('提交窗口崩溃'));

      const { engine } = createEngine([startExecutor, endExecutor]);
      await expect(engine.executeNextNode('pi-001')).rejects.toThrow('提交窗口崩溃');

      // 原子性（mock 语义=事务内操作不单独提交）：唯一一次 $transaction 被拒绝，
      // 完成行与令牌推进仅存在于该事务中——事务外零持久化、零终态写入
      expect(tx).toHaveBeenCalledTimes(1);
      expect(prisma.nodeExecution.update).toHaveBeenCalledTimes(1);
      expect(prisma.processInstance.update).toHaveBeenCalledTimes(1);
      const anyTerminalWrite = prisma.processInstance.update.mock.calls.some(
        (call: { data: Record<string, unknown> }[]) =>
          call[0]!.data.status === 'COMPLETED' || call[0]!.data.status === 'FAILED',
      );
      expect(anyTerminalWrite).toBe(false);
      // 执行行已创建（RUNNING 残留 = 下轮重执行的留痕）
      expect(prisma.nodeExecution.create).toHaveBeenCalledTimes(1);

      // BullMQ 重试再入：executor 重执行（副作用 at-least-once=非事务副作用固有属性，
      // 窗口 A 由工单显式登记），本次提交成功 → 推进至 end → 实例完成
      await engine.executeNextNode('pi-001');
      expect(startExecutor.execute).toHaveBeenCalledTimes(2);
      const finalUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'COMPLETED',
      );
      expect(finalUpdate).toBeDefined();
    });

    it('PE-13：无 error 出边异常——全链实例保持 RUNNING，行 FAILED 留痕，异常上抛', async () => {
      const schema = setupStartEnd();
      const failingExecutor = createMockExecutor('start', async () => {
        throw new Error('瞬时依赖抖动');
      });

      const { engine } = createEngine([failingExecutor]);
      await expect(engine.executeNextNode('pi-001')).rejects.toThrow('瞬时依赖抖动');

      // 实例不置 FAILED（BullMQ attempts:3 重试进门不再因非 RUNNING 早退空转）
      const instFailedUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(instFailedUpdate).toBeUndefined();
      // attempt 留痕
      const failedRow = prisma.nodeExecution.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedRow).toBeDefined();
      expect(failedRow![0]!.data.error).toBe('瞬时依赖抖动');
      expect(schema).toBeDefined();
    });

    it('PE-13：重试再入从失败节点重投（失败行不阻断重执行，第二次成功推进）', async () => {
      setupStartEnd();
      const startExecutor = createMockExecutor('start');
      startExecutor.execute
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ output: { ok: 2 }, wait: false });
      const endExecutor = createMockExecutor('end', async () => ({ output: {}, wait: false }));

      const { engine } = createEngine([startExecutor, endExecutor]);

      // 第一次投递：失败（实例保持 RUNNING）
      await expect(engine.executeNextNode('pi-001')).rejects.toThrow('boom');
      // 第二次投递（BullMQ 重试）：从失败节点重投成功 → 完成行 + 推进
      await engine.executeNextNode('pi-001');
      expect(startExecutor.execute).toHaveBeenCalledTimes(2);
      const completedRow = prisma.nodeExecution.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'COMPLETED',
      );
      expect(completedRow).toBeDefined();
    });

    it('PE-13 finalizeFailedInstance：RUNNING→FAILED+子流程父恢复入队；非 RUNNING 幂等跳过', async () => {
      const subInstance = makeInstanceRow({
        triggerContext: { _parent: { instanceId: 'pi-parent', nodeId: 'node-sub' } },
      });
      prisma.processInstance.findFirst.mockResolvedValue(subInstance);
      const { engine, delayQueue } = createEngine();

      await engine.finalizeFailedInstance('pi-001', '重试耗尽');
      const failedUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate![0]!.data.error).toBe('重试耗尽');
      // 子流程失败传播：父恢复 job 投递（瞬时重试期间不投——父实例继续等待）
      expect(delayQueue.add).toHaveBeenCalledWith(
        'resume',
        expect.objectContaining({
          instanceId: 'pi-parent',
          nodeId: 'node-sub',
          kind: 'resume_parent',
          subInstanceId: 'pi-001',
          subStatus: 'FAILED',
          error: '重试耗尽',
        }),
        expect.anything(),
      );

      // 幂等：非 RUNNING（已终结/等待中）不覆盖
      (prisma.processInstance.update as unknown as ReturnType<typeof vi.fn>).mockClear();
      (delayQueue.add as unknown as ReturnType<typeof vi.fn>).mockClear();
      prisma.processInstance.findFirst.mockResolvedValue({ ...subInstance, status: 'FAILED' });
      await engine.finalizeFailedInstance('pi-001', 'again');
      expect(prisma.processInstance.update).not.toHaveBeenCalled();
      expect(delayQueue.add).not.toHaveBeenCalled();
    });

    it('PE-13 retryInstance：FAILED→RUNNING+清 error+重新入队（从失败节点重投）', async () => {
      prisma.processInstance.findFirst.mockResolvedValue(
        makeInstanceRow({
          status: 'FAILED',
          error: '旧错误',
          activeNodeIds: ['node-start'],
          processDef: makeProcessDef({ workflowSchema: makeSimpleSchema() }),
        }),
      );
      const { engine, processQueue } = createEngine();

      const result = await engine.retryInstance('pi-001');

      const updateCall = prisma.processInstance.update.mock.calls[0]![0]! as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data).toEqual({ status: 'RUNNING', error: null });
      expect(processQueue.add).toHaveBeenCalledWith(
        'execute',
        { instanceId: 'pi-001' },
        expect.anything(),
      );
      expect(result.activeNodeIds).toEqual(['node-start']);
    });

    it('PE-13 retryInstance：非 FAILED 实例拒绝 400 / 无活跃令牌拒绝 400', async () => {
      const { engine } = createEngine();

      // RUNNING 实例不可重试
      prisma.processInstance.findFirst.mockResolvedValue(
        makeInstanceRow({ status: 'RUNNING', activeNodeIds: ['node-start'] }),
      );
      await expect(engine.retryInstance('pi-001')).rejects.toThrow(BadRequestException);
      expect(prisma.processInstance.update).not.toHaveBeenCalled();

      // FAILED 但令牌已空（无可重投节点）
      prisma.processInstance.findFirst.mockResolvedValue(
        makeInstanceRow({ status: 'FAILED', activeNodeIds: [] }),
      );
      await expect(engine.retryInstance('pi-001')).rejects.toThrow(/无活跃令牌/);
      expect(prisma.processInstance.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PE-12 — 入队失败补偿与孤儿实例 sweeper（R-B 波次④收官）
  // =========================================================================

  describe('PE-12 入队失败补偿与孤儿实例 sweeper', () => {
    beforeEach(() => {
      prisma.nodeExecution.count.mockResolvedValue(0);
    });

    it('startProcess 入队失败：删除刚建实例并抛出（孤儿 RUNNING 防源）', async () => {
      prisma.processDef.findFirst.mockResolvedValue(
        makeProcessDef({ id: 'pd-001', status: 'PUBLISHED', workflowSchema: makeSimpleSchema() }),
      );
      prisma.processInstance.create.mockResolvedValue(
        makeProcessInstance({ id: 'pi-orphan', activeNodeIds: ['node-start'] }),
      );
      prisma.processInstance.delete.mockResolvedValue(makeProcessInstance({ id: 'pi-orphan' }));
      const { engine, processQueue } = createEngine();
      (processQueue.add as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis connect ECONNREFUSED'),
      );

      await expect(engine.startProcess('tenant-001', 'pd-001', {})).rejects.toThrow(
        'Redis connect ECONNREFUSED',
      );
      // 刚创建的实例被回滚删除（不留无驱动孤儿）
      expect(prisma.processInstance.delete).toHaveBeenCalledWith({ where: { id: 'pi-orphan' } });
    });

    it('startProcess 入队失败且删除也失败：仍抛原始异常（尽力而为回滚不掩盖）', async () => {
      prisma.processDef.findFirst.mockResolvedValue(
        makeProcessDef({ id: 'pd-001', status: 'PUBLISHED', workflowSchema: makeSimpleSchema() }),
      );
      prisma.processInstance.create.mockResolvedValue(makeProcessInstance({ id: 'pi-orphan' }));
      prisma.processInstance.delete.mockRejectedValue(new Error('DB 也不可达'));
      const { engine, processQueue } = createEngine();
      (processQueue.add as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 不可达'),
      );

      await expect(engine.startProcess('tenant-001', 'pd-001', {})).rejects.toThrow('Redis 不可达');
    });

    it('PE-12 sweepStaleInstances：仅复活有活跃令牌的候选（无令牌跳过）', async () => {
      const staleMs = 600_000;
      const now = Date.now();
      const staleRunning = {
        id: 'pi-stale-1',
        tenantId: 'tenant-001',
        activeNodeIds: ['node-a'],
        updatedAt: new Date(now - staleMs - 60_000),
      };
      const noToken = {
        id: 'pi-notoken',
        tenantId: 'tenant-001',
        activeNodeIds: [],
        updatedAt: new Date(now - staleMs - 60_000),
      };
      // mock 只给查询会返回的候选（新鲜度由 where.updatedAt 过滤——见查询条件断言）
      prisma.processInstance.findMany.mockResolvedValue([staleRunning, noToken]);
      const { engine, processQueue } = createEngine();

      const revived = await engine.sweepStaleInstances({ staleMs, batch: 100 });

      // 只重投有活跃令牌的实例（无令牌=无待偿工作）
      expect(revived).toEqual(['pi-stale-1']);
      expect(processQueue.add).toHaveBeenCalledTimes(1);
      expect(processQueue.add).toHaveBeenCalledWith(
        'execute',
        { instanceId: 'pi-stale-1', source: 'sweeper' },
        expect.anything(),
      );
      // 查询条件：RUNNING + updatedAt 早于阈值 + 批量上限
      const query = prisma.processInstance.findMany.mock.calls[0]![0]! as {
        where: { status: string; updatedAt: { lt: Date } };
        take: number;
      };
      expect(query.where.status).toBe('RUNNING');
      expect(query.where.updatedAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - staleMs);
      expect(query.take).toBe(100);
    });

    it('PE-12 sweepStaleInstances：无候选时零入队', async () => {
      prisma.processInstance.findMany.mockResolvedValue([]);
      const { engine, processQueue } = createEngine();

      const revived = await engine.sweepStaleInstances({ staleMs: 600_000, batch: 100 });

      expect(revived).toEqual([]);
      expect(processQueue.add).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 波次⑤ — PE-15 环境上下文 / PE-18 decision 别名 / PE-19 快照版本列
  // =========================================================================

  describe('波次⑤ PE-15/PE-18/PE-19', () => {
    afterEach(() => {
      delete (globalThis as Record<string, unknown>).__mockEnvironmentId;
    });

    it('PE-15：task_timeout job 载荷携带 ALS 环境上下文（runWithEnv 对齐 executeNextNode）', async () => {
      (globalThis as Record<string, unknown>).__mockEnvironmentId = 'dev';
      const { engine, delayQueue } = createEngine();

      await engine.scheduleTaskTimeout('pi-001', 'node-1', 'ne-001', 60_000);

      const payload = (
        delayQueue.add.mock.calls[0] as unknown as [string, Record<string, unknown>]
      )[1]!;
      expect(payload.environmentId).toBe('dev');
    });

    it('PE-15：ALS 无环境时载荷不带 environmentId（交 processor 从实例行 fallback）', async () => {
      const { engine, delayQueue } = createEngine();

      await engine.scheduleTaskTimeout('pi-001', 'node-1', 'ne-001', 60_000);

      const payload = (
        delayQueue.add.mock.calls[0] as unknown as [string, Record<string, unknown>]
      )[1]!;
      expect('environmentId' in payload).toBe(false);
    });

    it('PE-18：冻结 schema 边条件消费顶层 decision 别名 → 注入保留（存量快照求值层兼容锚，OCR-critical 字符串存储形态）', async () => {
      // ◆7/ADR-0007 §二.2：存量冻结快照的 decision 边永久兼容——别名注入按需保留。
      // OCR 复审（2026-11-10）critical：edge.condition 实际存储为 JSON 字符串
      // （shared 类型+seed+冻结快照均字符串态），检测器须先解析（对象形态 mock
      // 强转会掩盖该缺口——真实存储形态做锚）
      const schema = {
        nodes: [
          makeNode('node-start', 'user_task', { taskName: '审批' }),
          makeNode('node-end', 'end'),
        ],
        edges: [
          {
            sourceNodeID: 'node-start',
            targetNodeID: 'node-end',
            condition: '{"==":[{"var":"decision"},"APPROVED"]}',
          },
        ],
      } as unknown as WorkflowSchema;
      const instance = makeProcessInstance({
        status: 'WAITING_USER_TASK',
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      const task = makeProcessTask({ nodeId: 'node-start', instance, nodeExecutionId: 'ne-1' });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.processTask.findUnique.mockResolvedValue({ status: 'PENDING' });
      prisma.processInstance.findFirst.mockResolvedValue(instance);

      const { engine } = createEngine();
      await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

      const txVarsUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) =>
          call[0]!.data.variables && typeof call[0]!.data.variables === 'object',
      );
      const variables = (txVarsUpdate![0]!.data.variables ?? {}) as Record<string, unknown>;
      expect(variables['decision']).toBe('APPROVED'); // 存量兼容：顶层别名保留
      // 节点命名空间照常（废弃主通道）
      expect((variables['node-start'] as Record<string, unknown>)?.['output']).toEqual(
        expect.objectContaining({ decision: 'APPROVED' }),
      );
    });

    it('PE-18：冻结 schema 边条件不消费顶层别名 → 不注入（废弃生效，多审批自矛盾不再新增）', async () => {
      // ◆7/ADR-0007 §二.1：新 schema 废弃顶层 decision 别名——「最后完成者成
      // 全局决策」的自矛盾终态不再新增；节点命名空间为唯一决策引用通道
      const schema = makeSimpleSchema({
        nodes: [
          makeNode('node-start', 'user_task', { taskName: '审批' }),
          makeNode('node-end', 'end'),
        ],
        edges: [{ sourceNodeID: 'node-start', targetNodeID: 'node-end' }],
      });
      const instance = makeProcessInstance({
        status: 'WAITING_USER_TASK',
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      const task = makeProcessTask({ nodeId: 'node-start', instance, nodeExecutionId: 'ne-1' });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.processTask.findUnique.mockResolvedValue({ status: 'PENDING' });
      prisma.processInstance.findFirst.mockResolvedValue(instance);

      const { engine } = createEngine();
      await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

      const txVarsUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) =>
          call[0]!.data.variables && typeof call[0]!.data.variables === 'object',
      );
      const variables = (txVarsUpdate![0]!.data.variables ?? {}) as Record<string, unknown>;
      expect(variables['decision']).toBeUndefined(); // 废弃：不注入
      expect((variables['node-start'] as Record<string, unknown>)?.['output']).toEqual(
        expect.objectContaining({ decision: 'APPROVED' }),
      );
    });

    it('PE-18：条件分支节点（IF）分支条件消费顶层别名 → 注入保留（OCR 补：非边条件存储位）', async () => {
      // OCR 复审（2026-11-10）medium：条件分支经 node.data.conditions[].condition
      // 求值（ConditionExecutor），不经 schema.edges——经 IF 节点分支决策的存量
      // 快照同样消费顶层别名，检测器遗漏则别名停注入→分支静默 undefined
      const schema = {
        nodes: [
          makeNode('node-start', 'user_task', { taskName: '审批' }),
          makeNode('node-if', 'condition', {
            conditions: [{ condition: '{"==":[{"var":"decision"},"APPROVED"]}' }],
          }),
          makeNode('node-end', 'end'),
        ],
        edges: [{ sourceNodeID: 'node-start', targetNodeID: 'node-end' }],
      } as unknown as WorkflowSchema;
      const instance = makeProcessInstance({
        status: 'WAITING_USER_TASK',
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      const task = makeProcessTask({ nodeId: 'node-start', instance, nodeExecutionId: 'ne-1' });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.updateMany.mockResolvedValue({ count: 1 });
      prisma.processTask.findUnique.mockResolvedValue({ status: 'PENDING' });
      prisma.processInstance.findFirst.mockResolvedValue(instance);

      const { engine } = createEngine();
      await engine.completeTask('t1', 'u1', 'approve', undefined, undefined);

      const txVarsUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) =>
          call[0]!.data.variables && typeof call[0]!.data.variables === 'object',
      );
      const variables = (txVarsUpdate![0]!.data.variables ?? {}) as Record<string, unknown>;
      expect(variables['decision']).toBe('APPROVED'); // IF 分支消费 → 注入保留
    });

    it('PE-19：startProcess 实例行钉住快照版本（活表发布路径）', async () => {
      prisma.processDef.findFirst.mockResolvedValue(
        makeProcessDef({
          id: 'pd-001',
          status: 'PUBLISHED',
          version: 3,
          workflowSchema: makeSimpleSchema(),
        }),
      );
      prisma.processInstance.create.mockResolvedValue(makeProcessInstance({ id: 'pi-snap' }));
      const { engine } = createEngine();

      await engine.startProcess('tenant-001', 'pd-001', {});

      const createData = prisma.processInstance.create.mock.calls[0]![0]! as {
        data: Record<string, unknown>;
      };
      expect(createData.data.snapshotVersion).toBe(3); // 发布时钉值（ADR-0007 §三）
    });

    it('PE-19：G6 schemaOverride 路径快照版本随冻结 schema 钉值', async () => {
      prisma.processDef.findFirst.mockResolvedValue(
        makeProcessDef({ id: 'pd-001', version: 7, workflowSchema: makeSimpleSchema() }),
      );
      prisma.processInstance.create.mockResolvedValue(makeProcessInstance({ id: 'pi-snap2' }));
      const { engine } = createEngine();

      // G6：钉 major 的冻结契约直通（def 行 version 为活表值，快照版本钉调用契约）
      await engine.startProcess('tenant-001', 'pd-001', {}, 'prod', {
        nodes: makeSimpleSchema().nodes,
        edges: makeSimpleSchema().edges,
      } as unknown as Record<string, unknown>);

      const createData = prisma.processInstance.create.mock.calls[0]![0]! as {
        data: Record<string, unknown>;
      };
      expect(createData.data.snapshotVersion).toBe(7);
    });
  });

  // =========================================================================
  // Schema 导航 — 条件分支嵌套
  // =========================================================================

  describe('条件分支嵌套节点查找', () => {
    it('executeNextNode 能找到嵌套在条件分支 block 内的节点', async () => {
      // 构造 schema: start → condition → [block-a (含 node-a)] / [block-b (含 node-b)] → end
      const schema: WorkflowSchema = {
        nodes: [
          makeNode('node-start', 'start'),
          {
            id: 'node-condition',
            type: 'condition',
            meta: {},
            data: {},
            blocks: [
              {
                id: 'block-a',
                type: 'block',
                meta: {},
                data: {},
                blocks: [makeNode('node-a', 'assign')],
              },
              {
                id: 'block-b',
                type: 'block',
                meta: {},
                data: {},
                blocks: [makeNode('node-b', 'assign')],
              },
            ],
          },
          makeNode('node-end', 'end'),
        ],
        edges: [
          { sourceNodeID: 'node-start', targetNodeID: 'node-condition' },
          { sourceNodeID: 'node-condition', targetNodeID: 'block-a', label: '条件A' },
          { sourceNodeID: 'node-condition', targetNodeID: 'block-b', label: '条件B' },
          { sourceNodeID: 'block-a', targetNodeID: 'node-end' },
          { sourceNodeID: 'block-b', targetNodeID: 'node-end' },
        ],
      };

      const startExecutor = createMockExecutor('start');
      const conditionExecutor = createMockExecutor('condition', async () => ({
        output: {},
        nextNodeIds: ['block-a'],
        wait: false,
      }));
      const blockExecutor = createMockExecutor('block', async () => ({
        output: {},
        wait: false,
      }));
      const assignExecutor = createMockExecutor('assign', async () => ({
        output: {},
        wait: false,
      }));
      const endExecutor = createMockExecutor('end');

      const instance = makeProcessInstance({
        activeNodeIds: ['node-start'],
        processDef: makeProcessDef({ workflowSchema: schema }),
      });
      prisma.processInstance.findFirst.mockResolvedValue(instance);
      prisma.nodeExecution.create.mockResolvedValue(makeNodeExecution());

      // 模拟 advanceTokens 更新
      prisma.processInstance.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...instance,
          ...args.data,
        }),
      );

      const { engine } = createEngine([
        startExecutor,
        conditionExecutor,
        blockExecutor,
        assignExecutor,
        endExecutor,
      ]);

      await engine.executeNextNode('pi-001');

      // start 和 condition 执行器应被调用
      expect(startExecutor.execute).toHaveBeenCalled();
      expect(conditionExecutor.execute).toHaveBeenCalled();
    });
  });
});
