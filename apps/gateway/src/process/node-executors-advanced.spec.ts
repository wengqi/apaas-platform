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
  /** 记录写内核 mock（评审 P1-5：批量写必须经 RecordService） */
  const recordService = {
    batchCreate: vi.fn(),
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
  };
  const executor = new BatchOperationExecutor(recordService as never);
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-1', tenantId: 't-1', appId: 'app-1' });
  });

  it('批量创建：经写内核（含校验/编号/公式/事件）', async () => {
    recordService.batchCreate.mockResolvedValue({ created: 2, errors: [] });
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
    expect(recordService.batchCreate).toHaveBeenCalledWith('t-1', 'obj-1', 'system', [
      { name: 'a' },
      { name: 'b' },
    ]);
    expect(prisma.record.createMany).not.toHaveBeenCalled();
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

  // 评审 P0-1 + P1-5：merge 语义与公式/Rollup/事件统一由记录写内核负责
  it('批量更新（recordIds 范围）：经写内核逐条 merge', async () => {
    prisma.record.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    recordService.batchUpdate.mockResolvedValue({ updated: 2, errors: [] });
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

    // 查询范围 = recordIds
    const findArg = prisma.record.findMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(findArg.where.id.in).toEqual(['r1', 'r2']);

    // 逐条 merge 由内核完成（执行器不得直接写库）
    expect(recordService.batchUpdate).toHaveBeenCalledWith('t-1', ['r1', 'r2'], 'system', {
      status: 'DONE',
    });
    expect(prisma.record.update).not.toHaveBeenCalled();
  });

  it('批量更新：兼容扁平 inputs（未包在 data 下）', async () => {
    prisma.record.findMany.mockResolvedValue([{ id: 'r9' }]);
    recordService.batchUpdate.mockResolvedValue({ updated: 1, errors: [] });
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'batch_operation',
        meta: {},
        data: makeData({ operation: 'update', objectId: 'obj-1' }),
      } as ExecutionContext['node'],
      inputs: { recordIds: ['r9'], flag: 'x' },
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ affectedCount: 1 });
    // recordIds 属于保留键，不作为字段写入
    expect(recordService.batchUpdate).toHaveBeenCalledWith('t-1', ['r9'], 'system', { flag: 'x' });
  });

  it('批量删除（filter 范围）：JsonLogic 条件解析后经写内核删除', async () => {
    prisma.record.findMany.mockResolvedValue([{ id: 'r-scrap' }]);
    recordService.batchDelete.mockResolvedValue({ deleted: 1, errors: [] });
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
    expect(recordService.batchDelete).toHaveBeenCalledWith('t-1', ['r-scrap']);
    expect(prisma.record.deleteMany).not.toHaveBeenCalled();
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
