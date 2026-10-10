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
 * - Schema 导航辅助（findNode / getOutgoingEdges / resolveNextNodes）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProcessEngine } from './process-engine.js';
import type { NodeExecutor } from './types.js';
import type { WorkflowSchema, WorkflowNode } from '@apaas/shared';
import { getMockPrisma, createMockQueue, createMockExecutor } from '../test/test-helpers.js';
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

    it('任务已完成时抛出 BadRequestException', async () => {
      prisma.processTask.findFirst.mockResolvedValue(makeProcessTask({ status: 'APPROVED' }));
      // 原子认领失败（count=0）→ 任务已被处理
      prisma.processTask.updateMany.mockResolvedValue({ count: 0 });
      const { engine } = createEngine();

      await expect(
        engine.completeTask('task-001', 'user-001', 'approve', undefined, undefined),
      ).rejects.toThrow(BadRequestException);
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
    it('节点执行抛出异常时标记 FAILED', async () => {
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

      // NodeExecution 应被标记为 FAILED
      const failedUpdate = prisma.nodeExecution.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate![0]!.data.error).toBe('Executor boom');

      // 实例也应被标记为 FAILED
      const instFailedUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(instFailedUpdate).toBeDefined();
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
