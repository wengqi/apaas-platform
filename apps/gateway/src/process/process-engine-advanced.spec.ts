/**
 * ProcessEngine 高级特性单元测试。
 *
 * 覆盖：
 * - 严格 AND-join：并行分支全部到齐后汇聚点才执行一次
 * - 分支发散的安全降级：无公共汇聚点时保持首达即执行（不卡死）
 * - 子流程同步等待：子实例完成后恢复父实例等待节点
 * - 等待条件节点：未满足重调度 / 满足推进 / 超时路由 timeout 出边
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessEngine } from './process-engine.js';
import { ParallelExecutor } from './node-executors/parallel.executor.js';
import type { NodeExecutor } from './types.js';
import type { WorkflowSchema, WorkflowNode, WorkflowEdge } from '@apaas/shared';
import { getMockPrisma, createMockQueue, createMockExecutor } from '../test/test-helpers.js';
import { makeProcessInstance } from '../test/mock-factories.js';

// ---------------------------------------------------------------------------
// Mock 基建
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
  const processQueue = createMockQueue();
  const delayQueue = createMockQueue();
  const redisLock = {
    withLock: (_key: string, fn: () => Promise<unknown>) => fn(),
  } as unknown as ConstructorParameters<typeof ProcessEngine>[2];
  const engine = new ProcessEngine(
    registry as unknown as ConstructorParameters<typeof ProcessEngine>[0],
    { create: vi.fn() } as unknown as ConstructorParameters<typeof ProcessEngine>[1],
    redisLock,
    {
      resolve: vi.fn().mockResolvedValue({
        environmentId: '',
        versionId: null,
        bundleMode: false,
        bundle: null,
      }),
    } as unknown as ConstructorParameters<typeof ProcessEngine>[3],
    processQueue as unknown as ConstructorParameters<typeof ProcessEngine>[4],
    delayQueue as unknown as ConstructorParameters<typeof ProcessEngine>[5],
  );
  return { engine, processQueue, delayQueue };
}

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, meta: {}, data } as WorkflowNode;
}

function makeEdge(
  source: string,
  target: string,
  extra: Record<string, unknown> = {},
): WorkflowEdge {
  return { sourceNodeID: source, targetNodeID: target, ...extra } as WorkflowEdge;
}

/** 带状态存储的 processInstance mock（findFirst 按 id 取，update 合并并返回）。 */
function setupInstanceStore(instances: Record<string, unknown>[]) {
  const prisma = getMockPrisma();
  const store = new Map<string, Record<string, unknown>>();
  for (const inst of instances) {
    store.set(inst['id'] as string, inst);
  }
  prisma.processInstance.findFirst.mockImplementation(
    async (args: { where: { id: string } }) => store.get(args.where.id) ?? null,
  );
  prisma.processInstance.update.mockImplementation(
    async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const stored = store.get(args.where.id);
      if (!stored) throw new Error(`实例 ${args.where.id} 不存在`);
      const updated = { ...stored, ...args.data };
      store.set(args.where.id, updated);
      return updated;
    },
  );
  return store;
}

/** 读取 setupInstanceStore 存储中的实例快照（供断言）。 */
function getStoredInstance(store: Map<string, Record<string, unknown>>, id: string) {
  return store.get(id);
}

// ---------------------------------------------------------------------------
// 严格 AND-join
// ---------------------------------------------------------------------------

describe('ProcessEngine 严格汇聚（AND-join）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    prisma.nodeExecution.count.mockResolvedValue(0);
    prisma.nodeExecution.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: `ne-${Math.random().toString(36).slice(2, 8)}`,
        ...args.data,
      }),
    );
    prisma.nodeExecution.update.mockResolvedValue({});
    prisma.nodeExecution.updateMany.mockResolvedValue({ count: 1 });
  });

  it('并行分支令牌全部到齐后，汇聚点只执行一次', async () => {
    // parallel → a1 / b1；a1 → join_0；b1 → join_0；join_0 → end_0
    const schema = {
      nodes: [
        makeNode('n-parallel', 'parallel'),
        makeNode('a1', 'branch_node'),
        makeNode('b1', 'branch_node'),
        makeNode('join_0', 'join_node'),
        makeNode('end_0', 'end'),
      ],
      edges: [
        makeEdge('n-parallel', 'a1'),
        makeEdge('n-parallel', 'b1'),
        makeEdge('a1', 'join_0'),
        makeEdge('b1', 'join_0'),
        makeEdge('join_0', 'end_0'),
      ],
    } as unknown as WorkflowSchema;

    const parallelExecutor = new ParallelExecutor();
    const branchExec = createMockExecutor('branch_node');
    const joinExec = createMockExecutor('join_node');
    const endExec = createMockExecutor('end', async () => ({ output: {} }));
    const { engine } = createEngine([parallelExecutor, branchExec, joinExec, endExec]);

    const instance = makeProcessInstance({
      id: 'pi-join',
      activeNodeIds: ['n-parallel'],
      processDef: {
        id: 'pd-1',
        tenantId: 'tenant-001',
        appId: 'app-001',
        workflowSchema: schema,
      },
    });
    const store = setupInstanceStore([instance]);

    await engine.executeNextNode('pi-join');

    // 汇聚点 join_0 只执行一次（两个分支令牌都到齐后才放行）
    expect(joinExec.execute).toHaveBeenCalledTimes(1);
    // 汇聚等待状态已清空
    const final = getStoredInstance(store, 'pi-join');
    expect((final?.['variables'] as Record<string, unknown>)['_joins']).toBeUndefined();
    // 实例正常完成
    expect(final?.['status']).toBe('COMPLETED');
  });

  it('分支发散（无公共汇聚点）时安全降级为首达即执行，不卡死', async () => {
    // parallel → a1 / b1；a1 → join_0；b1 无出边（死端）；join_0 → end_0
    const schema = {
      nodes: [
        makeNode('n-parallel', 'parallel'),
        makeNode('a1', 'branch_node'),
        makeNode('b1', 'branch_node'),
        makeNode('join_0', 'join_node'),
        makeNode('end_0', 'end'),
      ],
      edges: [
        makeEdge('n-parallel', 'a1'),
        makeEdge('n-parallel', 'b1'),
        makeEdge('a1', 'join_0'),
        makeEdge('join_0', 'end_0'),
      ],
    } as unknown as WorkflowSchema;

    const parallelExecutor = new ParallelExecutor();
    const branchExec = createMockExecutor('branch_node');
    const joinExec = createMockExecutor('join_node');
    const endExec = createMockExecutor('end', async () => ({ output: {} }));
    const { engine } = createEngine([parallelExecutor, branchExec, joinExec, endExec]);

    const instance = makeProcessInstance({
      id: 'pi-div',
      activeNodeIds: ['n-parallel'],
      processDef: { id: 'pd-1', tenantId: 'tenant-001', appId: 'app-001', workflowSchema: schema },
    });
    const store = setupInstanceStore([instance]);

    // 不应因等待 b1 的死端令牌而卡死：a1 到达 join_0 直接执行，实例正常完成
    await engine.executeNextNode('pi-div');
    expect(joinExec.execute).toHaveBeenCalledTimes(1);
    expect(getStoredInstance(store, 'pi-div')?.['status']).toBe('COMPLETED');
  });
});

// ---------------------------------------------------------------------------
// 子流程同步等待
// ---------------------------------------------------------------------------

describe('ProcessEngine 子流程同步等待', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    prisma.nodeExecution.count.mockResolvedValue(0);
    prisma.nodeExecution.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: `ne-${Math.random().toString(36).slice(2, 8)}`,
        ...args.data,
      }),
    );
    prisma.nodeExecution.update.mockResolvedValue({});
    prisma.nodeExecution.updateMany.mockResolvedValue({ count: 1 });
  });

  it('子实例完成后恢复父实例的等待节点并推进令牌', async () => {
    const parentSchema = {
      nodes: [makeNode('sub-1', 'sub_process'), makeNode('after-1', 'assign')],
      edges: [makeEdge('sub-1', 'after-1')],
    } as unknown as WorkflowSchema;

    const parent = makeProcessInstance({
      id: 'pi-parent',
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['sub-1'],
      processDef: {
        id: 'pd-parent',
        tenantId: 'tenant-001',
        appId: 'app-001',
        workflowSchema: parentSchema,
      },
    });
    const sub = makeProcessInstance({
      id: 'pi-sub',
      status: 'RUNNING',
      activeNodeIds: [],
      triggerContext: {
        triggeredBy: 'SUB_PROCESS',
        _parent: { instanceId: 'pi-parent', nodeId: 'sub-1' },
      },
    });
    const store = setupInstanceStore([parent, sub]);

    const { engine, processQueue } = createEngine([]);

    await engine.executeNextNode('pi-sub');

    // 子实例完成
    expect(getStoredInstance(store, 'pi-sub')?.['status']).toBe('COMPLETED');
    // 父实例恢复：状态 RUNNING，令牌推进到下游节点
    const parentAfter = getStoredInstance(store, 'pi-parent');
    expect(parentAfter?.['status']).toBe('RUNNING');
    expect(parentAfter?.['activeNodeIds']).toEqual(['after-1']);
    // 子流程输出写入父实例变量
    const parentVars = (parentAfter?.['variables'] ?? {}) as Record<string, unknown>;
    expect((parentVars['sub-1'] as Record<string, unknown>)['output']).toMatchObject({
      subInstanceId: 'pi-sub',
      status: 'COMPLETED',
    });
    // 父实例重新入队推进
    expect(processQueue.add).toHaveBeenCalledWith(
      'execute',
      { instanceId: 'pi-parent' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('子实例失败时父实例同步置 FAILED（不永久挂起）', async () => {
    const parent = makeProcessInstance({
      id: 'pi-parent-f',
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['sub-1'],
      processDef: {
        id: 'pd-parent',
        tenantId: 'tenant-001',
        appId: 'app-001',
        workflowSchema: { nodes: [], edges: [] } as unknown as WorkflowSchema,
      },
    });
    // 子实例已在引擎外被置 FAILED（例如节点执行失败路径），但携带 _parent 链接
    // 失败路径通过 executeNode 的 catch 触发，这里直接模拟"失败实例被再次推进"不可行，
    // 改为验证 resumeParentAfterSubProcess 的对外行为：通过私有方法无法直接调用，
    // 因此用节点执行失败路径驱动：子实例执行节点时执行器抛错。
    const sub = makeProcessInstance({
      id: 'pi-sub-f',
      status: 'RUNNING',
      activeNodeIds: ['boom-1'],
      triggerContext: {
        triggeredBy: 'SUB_PROCESS',
        _parent: { instanceId: 'pi-parent-f', nodeId: 'sub-1' },
      },
      processDef: {
        id: 'pd-sub',
        tenantId: 'tenant-001',
        appId: 'app-001',
        workflowSchema: {
          nodes: [makeNode('boom-1', 'boom')],
          edges: [],
        } as unknown as WorkflowSchema,
      },
    });
    const store = setupInstanceStore([parent, sub]);

    const boomExec = createMockExecutor('boom', async () => {
      throw new Error('子流程内部错误');
    });
    const { engine } = createEngine([boomExec]);

    // executeNextNode 会吞掉执行器错误（引擎 catch 后 throw，由 worker 记录）
    await expect(engine.executeNextNode('pi-sub-f')).rejects.toThrow('子流程内部错误');

    // 子实例 FAILED
    expect(getStoredInstance(store, 'pi-sub-f')?.['status']).toBe('FAILED');
    // 父实例同步 FAILED
    expect(getStoredInstance(store, 'pi-parent-f')?.['status']).toBe('FAILED');
    expect(String(getStoredInstance(store, 'pi-parent-f')?.['error'])).toContain(
      '子流程实例 pi-sub-f',
    );
  });
});

// ---------------------------------------------------------------------------
// 等待条件节点
// ---------------------------------------------------------------------------

describe('ProcessEngine 等待条件节点恢复', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    prisma.nodeExecution.count.mockResolvedValue(0);
    prisma.nodeExecution.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: `ne-${Math.random().toString(36).slice(2, 8)}`,
        ...args.data,
      }),
    );
    prisma.nodeExecution.update.mockResolvedValue({});
    prisma.nodeExecution.updateMany.mockResolvedValue({ count: 1 });
    prisma.processInstance.update.mockImplementation(
      async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...makeProcessInstance({ id: args.where.id }),
        ...args.data,
      }),
    );
  });

  function makeWcSchema(condition: object, withTimeoutEdge = false): WorkflowSchema {
    const edges = [makeEdge('wc-1', 'after-1')];
    if (withTimeoutEdge) {
      edges.push(makeEdge('wc-1', 'timeout-1', { label: 'timeout' }));
    }
    return {
      nodes: [
        makeNode('wc-1', 'wait_for_condition', { condition, timeoutMs: 1000 }),
        makeNode('after-1', 'assign'),
        makeNode('timeout-1', 'assign'),
      ],
      edges,
    } as unknown as WorkflowSchema;
  }

  function makeWaitingExec(startedAt: Date) {
    return { id: 'ne-wc', instanceId: 'pi-wc', nodeId: 'wc-1', status: 'WAITING', startedAt };
  }

  it('条件未满足且未超时：重新调度检查（kind=wait_condition），不推进令牌', async () => {
    const schema = makeWcSchema({ '==': [{ var: 'status' }, 'DONE'] });
    const instance = makeProcessInstance({
      id: 'pi-wc',
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['wc-1'],
      variables: { status: 'PENDING' },
      processDef: { id: 'pd-1', tenantId: 'tenant-001', appId: 'app-001', workflowSchema: schema },
    });
    setupInstanceStore([instance]);
    prisma.nodeExecution.findFirst.mockResolvedValue(makeWaitingExec(new Date()));

    const { engine, delayQueue } = createEngine([]);
    await engine.resumeWaitCondition('pi-wc', 'wc-1');

    expect(delayQueue.add).toHaveBeenCalledWith(
      'resume',
      { instanceId: 'pi-wc', nodeId: 'wc-1', kind: 'wait_condition' },
      { delay: expect.any(Number) },
    );
    // 实例保持等待状态
    expect(instance['status']).toBe('WAITING_USER_TASK');
  });

  it('条件满足：完成节点并推进令牌到下游', async () => {
    const schema = makeWcSchema({ '==': [{ var: 'status' }, 'DONE'] });
    const instance = makeProcessInstance({
      id: 'pi-wc',
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['wc-1'],
      variables: { status: 'DONE' },
      processDef: { id: 'pd-1', tenantId: 'tenant-001', appId: 'app-001', workflowSchema: schema },
    });
    const store = setupInstanceStore([instance]);
    prisma.nodeExecution.findFirst.mockResolvedValue(makeWaitingExec(new Date()));

    const { engine, processQueue } = createEngine([]);
    await engine.resumeWaitCondition('pi-wc', 'wc-1');

    const after = getStoredInstance(store, 'pi-wc');
    expect(after?.['status']).toBe('RUNNING');
    expect(after?.['activeNodeIds']).toEqual(['after-1']);
    expect(processQueue.add).toHaveBeenCalledWith(
      'execute',
      { instanceId: 'pi-wc' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('超时且配置 timeout 出边：路由到 timeout 分支', async () => {
    const schema = makeWcSchema({ '==': [{ var: 'status' }, 'DONE'] }, true);
    const instance = makeProcessInstance({
      id: 'pi-wc',
      status: 'WAITING_USER_TASK',
      activeNodeIds: ['wc-1'],
      variables: { status: 'PENDING' },
      processDef: { id: 'pd-1', tenantId: 'tenant-001', appId: 'app-001', workflowSchema: schema },
    });
    const store = setupInstanceStore([instance]);
    // 25 小时前进入等待（默认超时 24h）
    prisma.nodeExecution.findFirst.mockResolvedValue(
      makeWaitingExec(new Date(Date.now() - 25 * 3_600_000)),
    );

    const { engine, delayQueue } = createEngine([]);
    await engine.resumeWaitCondition('pi-wc', 'wc-1');

    const after = getStoredInstance(store, 'pi-wc');
    expect(after?.['activeNodeIds']).toEqual(['timeout-1']);
    // 超时路径不重调度检查
    expect(delayQueue.add).not.toHaveBeenCalled();
  });
});
