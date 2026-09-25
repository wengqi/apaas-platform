/**
 * 流程控制扩展节点执行器单元测试。
 *
 * 覆盖：inclusive（包容分支）/ loop（循环）/ break / continue /
 *       wait_for_condition（等待条件）/ batch_operation（批量操作）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WorkflowSchema, WorkflowEdge } from '@apaas/shared';
import { getMockPrisma } from '../test/test-helpers.js';
import { InclusiveExecutor } from './node-executors/inclusive.executor.js';
import { LoopExecutor } from './node-executors/loop.executor.js';
import { BreakExecutor } from './node-executors/break.executor.js';
import { ContinueExecutor } from './node-executors/continue.executor.js';
import { WaitForConditionExecutor } from './node-executors/wait-for-condition.executor.js';
import { BatchOperationExecutor } from './node-executors/batch-operation.executor.js';
import type { ExecutionContext, NodeExecutionResult } from './types.js';

// ---------------------------------------------------------------------------
// 辅助：构造执行上下文
// ---------------------------------------------------------------------------

function makeEdge(source: string, target: string, condition?: object | string): WorkflowEdge {
  return {
    sourceNodeID: source,
    targetNodeID: target,
    ...(condition ? { condition } : {}),
  } as WorkflowEdge;
}

function makeSchema(
  edges: WorkflowEdge[],
  extraNodes: Array<{ id: string; type: string }> = [],
  rootType = 'inclusive',
): WorkflowSchema {
  return {
    nodes: [
      { id: 'n0', type: rootType, meta: {}, data: {} },
      ...extraNodes.map((n) => ({ ...n, meta: {}, data: {} })),
    ],
    edges,
  } as unknown as WorkflowSchema;
}

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    instance: { id: 'pi-1', tenantId: 't-1', triggerContext: {} } as ExecutionContext['instance'],
    node: { id: 'n0', type: 'inclusive', meta: {}, data: {} } as ExecutionContext['node'],
    nodeExecutionId: 'ne-1',
    outgoingEdges: [],
    inputs: {},
    variables: {},
    tenantId: 't-1',
    appId: 'app-1',
    schema: makeSchema([]),
    startSubProcess: vi.fn(),
    scheduleDelay: vi.fn(),
    ...overrides,
  };
}

function makeData(data: Record<string, unknown>): Record<string, unknown> {
  return data;
}

// ---------------------------------------------------------------------------
// InclusiveExecutor — 包容分支
// ---------------------------------------------------------------------------

describe('InclusiveExecutor', () => {
  const executor = new InclusiveExecutor();

  it('激活全部条件满足的分支（OR 语义）', async () => {
    const ctx = makeCtx({
      outgoingEdges: [
        makeEdge('n0', 'a', { '>': [{ var: 'amount' }, 100] }),
        makeEdge('n0', 'b', { '>': [{ var: 'amount' }, 200] }),
        makeEdge('n0', 'c', { '>': [{ var: 'amount' }, 9999] }),
      ],
      variables: { amount: 300 },
    });
    const result: NodeExecutionResult = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['a', 'b']);
  });

  it('无分支满足时走无条件边（else 语义）', async () => {
    const ctx = makeCtx({
      outgoingEdges: [
        makeEdge('n0', 'a', { '>': [{ var: 'amount' }, 9999] }),
        makeEdge('n0', 'else1'),
        makeEdge('n0', 'else2'),
      ],
      variables: { amount: 1 },
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['else1', 'else2']);
  });

  it('条件求值异常的边被跳过（不阻断其他分支）', async () => {
    const ctx = makeCtx({
      outgoingEdges: [
        makeEdge('n0', 'bad', 'not-json{{'),
        makeEdge('n0', 'good', { '>': [{ var: 'amount' }, 1] }),
      ],
      variables: { amount: 10 },
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['good']);
  });
});

// ---------------------------------------------------------------------------
// LoopExecutor — 循环
// ---------------------------------------------------------------------------

describe('LoopExecutor', () => {
  const executor = new LoopExecutor();

  function loopSchema(): WorkflowSchema {
    // loop → body → loop（体边成环）；loop → done（完成边）
    return makeSchema(
      [makeEdge('n0', 'body'), makeEdge('body', 'n0'), makeEdge('n0', 'done')],
      [
        { id: 'body', type: 'assign' },
        { id: 'done', type: 'end' },
      ],
      'loop',
    );
  }

  it('首次进入：启动第一次迭代并路由到循环体', async () => {
    const ctx = makeCtx({
      schema: loopSchema(),
      outgoingEdges: loopSchema().edges.filter((e) => e.sourceNodeID === 'n0'),
      inputs: { collection: ['x', 'y', 'z'] },
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ index: 0, item: 'x', total: 3 });
    expect(result.nextNodeIds).toEqual(['body']);
    // 迭代状态写入 variables._loops
    const loops = ctx.variables['_loops'] as Record<string, { index: number; items: unknown[] }>;
    expect(loops['n0']).toEqual({ index: 0, items: ['x', 'y', 'z'] });
  });

  it('再入：推进迭代，item 更新为下一个元素', async () => {
    const variables: Record<string, unknown> = {
      _loops: { n0: { index: 0, items: ['x', 'y', 'z'] } },
    };
    const ctx = makeCtx({
      schema: loopSchema(),
      outgoingEdges: loopSchema().edges.filter((e) => e.sourceNodeID === 'n0'),
      variables,
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ index: 1, item: 'y', total: 3 });
    expect(result.nextNodeIds).toEqual(['body']);
  });

  it('最后一次再入：清除循环状态并走完成边', async () => {
    const variables: Record<string, unknown> = {
      _loops: { n0: { index: 2, items: ['x', 'y', 'z'] } },
    };
    const ctx = makeCtx({
      schema: loopSchema(),
      outgoingEdges: loopSchema().edges.filter((e) => e.sourceNodeID === 'n0'),
      variables,
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['done']);
    expect(ctx.variables['_loops']).toBeUndefined();
  });

  it('空集合：直接走完成边，不进入循环体', async () => {
    const ctx = makeCtx({
      schema: loopSchema(),
      outgoingEdges: loopSchema().edges.filter((e) => e.sourceNodeID === 'n0'),
      inputs: { collection: [] },
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['done']);
    expect(result.output).toEqual({ total: 0, iterations: 0 });
  });

  it('集合超过 maxIterations 抛错（防呆）', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'loop',
        meta: {},
        data: makeData({ maxIterations: 2 }),
      } as ExecutionContext['node'],
      schema: loopSchema(),
      outgoingEdges: loopSchema().edges.filter((e) => e.sourceNodeID === 'n0'),
      inputs: { collection: [1, 2, 3] },
    });
    await expect(executor.execute(ctx)).rejects.toThrow('超过 maxIterations');
  });
});

// ---------------------------------------------------------------------------
// BreakExecutor / ContinueExecutor
// ---------------------------------------------------------------------------

describe('BreakExecutor', () => {
  const executor = new BreakExecutor();

  function loopWithBreakSchema(): WorkflowSchema {
    // n0 → b1 → brk → b2 → n0（体边成环，break 在体内）；n0 → done（完成边）
    return makeSchema(
      [
        makeEdge('n0', 'b1'),
        makeEdge('b1', 'brk'),
        makeEdge('brk', 'b2'),
        makeEdge('b2', 'n0'),
        makeEdge('n0', 'done'),
      ],
      [
        { id: 'b1', type: 'assign' },
        { id: 'brk', type: 'break' },
        { id: 'b2', type: 'assign' },
        { id: 'done', type: 'end' },
      ],
      'loop',
    );
  }

  it('跳出循环：清除状态并路由到完成边', async () => {
    const schema = loopWithBreakSchema();
    const variables: Record<string, unknown> = {
      _loops: { n0: { index: 0, items: [1, 2] } },
    };
    const ctx = makeCtx({
      node: { id: 'brk', type: 'break', meta: {}, data: {} } as ExecutionContext['node'],
      schema,
      variables,
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['done']);
    expect(ctx.variables['_loops']).toBeUndefined();
  });

  it('不在循环体内：令牌终止', async () => {
    const ctx = makeCtx({
      schema: makeSchema([]),
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual([]);
  });
});

describe('ContinueExecutor', () => {
  const executor = new ContinueExecutor();

  it('令牌跳回循环节点（推进下一次迭代）', async () => {
    // n0 → b1 → cont → n0（continue 在体内并连回循环节点）；n0 → done
    const schema = makeSchema(
      [
        makeEdge('n0', 'b1'),
        makeEdge('b1', 'cont'),
        makeEdge('cont', 'n0'),
        makeEdge('n0', 'done'),
      ],
      [
        { id: 'b1', type: 'assign' },
        { id: 'cont', type: 'continue' },
        { id: 'done', type: 'end' },
      ],
      'loop',
    );
    const ctx = makeCtx({
      node: { id: 'cont', type: 'continue', meta: {}, data: {} } as ExecutionContext['node'],
      schema,
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['n0']);
  });
});

// ---------------------------------------------------------------------------
// WaitForConditionExecutor — 等待条件
// ---------------------------------------------------------------------------

describe('WaitForConditionExecutor', () => {
  const executor = new WaitForConditionExecutor();

  it('条件满足：直接通过，不暂停', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'wait_for_condition',
        meta: {},
        data: makeData({ condition: { '==': [{ var: 'status' }, 'DONE'] } }),
      } as ExecutionContext['node'],
      variables: { status: 'DONE' },
    });
    const result = await executor.execute(ctx);
    expect(result.wait).toBeFalsy();
    expect(result.output).toEqual({ satisfied: true });
    expect(ctx.scheduleDelay).not.toHaveBeenCalled();
  });

  it('条件未满足：调度重新检查（kind=wait_condition）并暂停', async () => {
    const scheduleDelay = vi.fn();
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'wait_for_condition',
        meta: {},
        data: makeData({ condition: { '==': [{ var: 'status' }, 'DONE'] }, pollIntervalMs: 5000 }),
      } as ExecutionContext['node'],
      variables: { status: 'PENDING' },
      scheduleDelay,
    });
    const result = await executor.execute(ctx);
    expect(result.wait).toBe(true);
    expect(scheduleDelay).toHaveBeenCalledWith('pi-1', 'n0', 5000, 'wait_condition');
  });

  it('condition 为非法 JSON 字符串：抛出配置错误', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'wait_for_condition',
        meta: {},
        data: makeData({ condition: 'not-json{{' }),
      } as ExecutionContext['node'],
    });
    await expect(executor.execute(ctx)).rejects.toThrow('condition 配置无效');
  });

  it('未配置 condition：视为立即满足', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'wait_for_condition',
        meta: {},
        data: {},
      } as ExecutionContext['node'],
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ satisfied: true });
  });
});

// ---------------------------------------------------------------------------
// BatchOperationExecutor — 批量操作
// ---------------------------------------------------------------------------

describe('BatchOperationExecutor', () => {
  const executor = new BatchOperationExecutor();
  const prisma = getMockPrisma();

  beforeEach(() => {
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-1', tenantId: 't-1', appId: 'app-1' });
  });

  it('批量创建：records 数组走 createMany', async () => {
    prisma.record.createMany.mockResolvedValue({ count: 2 });
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'batch_operation',
        meta: {},
        data: makeData({ operation: 'create', objectId: 'obj-1' }),
      } as ExecutionContext['node'],
      inputs: { records: [{ name: 'a' }, { name: 'b' }] },
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ createdCount: 2 });
    expect(prisma.record.createMany).toHaveBeenCalledOnce();
    const arg = prisma.record.createMany.mock.calls[0]?.[0] as { data: unknown[] };
    expect(arg.data).toHaveLength(2);
  });

  it('records 不是数组：抛错', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'batch_operation',
        meta: {},
        data: makeData({ operation: 'create', objectId: 'obj-1' }),
      } as ExecutionContext['node'],
      inputs: { records: 'not-array' },
    });
    await expect(executor.execute(ctx)).rejects.toThrow('必须是数组');
  });

  it('批量更新（recordIds 范围）：updateMany 带 id in', async () => {
    prisma.record.updateMany.mockResolvedValue({ count: 2 });
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'batch_operation',
        meta: {},
        data: makeData({ operation: 'update', objectId: 'obj-1' }),
      } as ExecutionContext['node'],
      inputs: { recordIds: ['r1', 'r2'], data: { status: 'DONE' } },
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ affectedCount: 2 });
    const arg = prisma.record.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
      data: { data: unknown };
    };
    expect(arg.where.id.in).toEqual(['r1', 'r2']);
    expect(arg.data.data).toEqual({ status: 'DONE' });
  });

  it('批量删除（filter 范围）：deleteMany 注入 JsonLogic 条件', async () => {
    prisma.record.deleteMany.mockResolvedValue({ count: 1 });
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'batch_operation',
        meta: {},
        data: makeData({
          operation: 'delete',
          objectId: 'obj-1',
          filter: { '==': [{ var: 'status' }, 'SCRAPPED'] },
        }),
      } as ExecutionContext['node'],
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ affectedCount: 1 });
    expect(prisma.record.deleteMany).toHaveBeenCalledOnce();
  });

  it('无 recordIds 且无 filter：拒绝全表操作', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'batch_operation',
        meta: {},
        data: makeData({ operation: 'delete', objectId: 'obj-1' }),
      } as ExecutionContext['node'],
    });
    await expect(executor.execute(ctx)).rejects.toThrow('拒绝全表操作');
  });
});
