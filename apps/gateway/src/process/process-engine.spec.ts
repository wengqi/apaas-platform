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
  const engine = new ProcessEngine(
    registry as unknown as ConstructorParameters<typeof ProcessEngine>[0],
    inAppMessageService as unknown as ConstructorParameters<typeof ProcessEngine>[1],
    processQueue as unknown as ConstructorParameters<typeof ProcessEngine>[2],
    delayQueue as unknown as ConstructorParameters<typeof ProcessEngine>[3],
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
      expect(processQueue.add).toHaveBeenCalledWith('execute', { instanceId: 'pi-001' });
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
      expect(processQueue.add).toHaveBeenCalledWith('execute', { instanceId: 'pi-001' });
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
      const task = makeProcessTask({
        nodeId: 'node-task',
        instance: makeProcessInstance({
          activeNodeIds: ['node-task'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.update.mockResolvedValue(task);
      prisma.processInstance.update.mockResolvedValue(
        makeProcessInstance({ status: 'RUNNING', activeNodeIds: ['node-end'] }),
      );

      const { engine, processQueue } = createEngine();

      await engine.completeTask('task-001', 'user-001', 'approve', '同意', undefined);

      // 任务状态应为 APPROVED
      const taskUpdate = prisma.processTask.update.mock.calls[0]![0];
      expect(taskUpdate.data.status).toBe('APPROVED');
      expect(taskUpdate.data.decision).toBe('APPROVE');
      expect(taskUpdate.data.comment).toBe('同意');
      // 实例应恢复为 RUNNING
      const instUpdate = prisma.processInstance.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'RUNNING',
      );
      expect(instUpdate).toBeDefined();
      // 应入队继续执行
      expect(processQueue.add).toHaveBeenCalledWith('execute', { instanceId: 'pi-001' });
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
      const task = makeProcessTask({
        nodeId: 'node-task',
        instance: makeProcessInstance({
          activeNodeIds: ['node-task'],
          processDef: makeProcessDef({ workflowSchema: schema }),
        }),
      });
      prisma.processTask.findFirst.mockResolvedValue(task);
      prisma.processTask.update.mockResolvedValue(task);
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
        const task = makeProcessTask({
          nodeId: 'node-task',
          instance: makeProcessInstance({
            activeNodeIds: ['node-task'],
            processDef: makeProcessDef({ workflowSchema: schema }),
          }),
        });
        prisma.processTask.findFirst.mockResolvedValue(task);
        prisma.processTask.update.mockResolvedValue(task);
        prisma.processInstance.update.mockResolvedValue(makeProcessInstance());

        const { engine } = createEngine();
        await engine.completeTask('task-001', 'user-001', decision, undefined, undefined);

        const taskUpdate = prisma.processTask.update.mock.calls.at(-1)![0];
        expect(taskUpdate.data.status).toBe('APPROVED');
      }
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
      expect(processQueue.add).toHaveBeenCalledWith('execute', { instanceId: 'pi-001' });
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
