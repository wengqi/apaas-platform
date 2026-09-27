/**
 * 流程节点执行器单元测试 — 真实实现覆盖。
 *
 * 此前的 process-engine.spec 用 mock 执行器测引擎内核，执行器本体无覆盖。
 * 本文件直接实例化执行器，覆盖：assign / start / end / trigger / block /
 * condition / user_task / notification / delay / http_request / object_operation / sub_process。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { WorkflowEdge, WorkflowSchema } from '@apaas/shared';
import { getMockPrisma } from '../test/test-helpers.js';
import type { ExecutionContext, NodeExecutionResult } from './types.js';
import { AssignExecutor } from './node-executors/assign.executor.js';
import { StartExecutor } from './node-executors/start.executor.js';
import { EndExecutor } from './node-executors/end.executor.js';
import { TriggerExecutor } from './node-executors/trigger.executor.js';
import { BlockExecutor } from './node-executors/block.executor.js';
import { ConditionExecutor } from './node-executors/condition.executor.js';
import { UserTaskExecutor } from './node-executors/user-task.executor.js';
import { NotificationExecutor } from './node-executors/notification.executor.js';
import { DelayExecutor } from './node-executors/delay.executor.js';
import { HttpRequestExecutor } from './node-executors/http-request.executor.js';
import { ObjectOperationExecutor } from './node-executors/object-operation.executor.js';
import { SubProcessExecutor } from './node-executors/sub-process.executor.js';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function makeEdge(
  source: string,
  target: string,
  extra: Record<string, unknown> = {},
): WorkflowEdge {
  return { sourceNodeID: source, targetNodeID: target, ...extra } as WorkflowEdge;
}

const EMPTY_SCHEMA = { nodes: [], edges: [] } as unknown as WorkflowSchema;

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    instance: { id: 'pi-1', tenantId: 't-1', triggerContext: {} } as ExecutionContext['instance'],
    node: { id: 'n0', type: 'assign', meta: {}, data: {} } as ExecutionContext['node'],
    nodeExecutionId: 'ne-1',
    outgoingEdges: [],
    inputs: {},
    variables: {},
    tenantId: 't-1',
    appId: 'app-1',
    schema: EMPTY_SCHEMA,
    startSubProcess: vi.fn(),
    scheduleDelay: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assign / start / end / trigger / block
// ---------------------------------------------------------------------------

describe('AssignExecutor', () => {
  const executor = new AssignExecutor();

  it('写入全局变量作用域', async () => {
    const ctx = makeCtx({
      node: {
        id: 'n0',
        type: 'assign',
        meta: {},
        data: { variableName: 'amount' },
      } as ExecutionContext['node'],
      inputs: { value: 2000 },
    });
    const result: NodeExecutionResult = await executor.execute(ctx);
    expect(result.output).toEqual({ variableName: 'amount', value: 2000 });
    expect((ctx.variables['global'] as Record<string, unknown>)['amount']).toBe(2000);
  });

  it('缺 variableName 时不写入，返回原值', async () => {
    const ctx = makeCtx({ inputs: { value: 1 } });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ variableName: undefined, value: 1 });
  });
});

describe('StartExecutor / EndExecutor / TriggerExecutor', () => {
  it('start：输出 = 流程入参', async () => {
    const result = await new StartExecutor().execute(makeCtx({ inputs: { amount: 100 } }));
    expect(result.output).toEqual({ amount: 100 });
  });

  it('end：令牌终止（nextNodeIds 空）', async () => {
    const result = await new EndExecutor().execute(makeCtx({ inputs: { result: 'done' } }));
    expect(result.nextNodeIds).toEqual([]);
    expect(result.output).toEqual({ result: 'done' });
  });

  it('trigger：输出 = 实例触发上下文', async () => {
    const ctx = makeCtx({
      instance: {
        id: 'pi-1',
        tenantId: 't-1',
        triggerContext: { eventType: 'created', recordId: 'r-1' },
      } as unknown as ExecutionContext['instance'],
    });
    const result = await new TriggerExecutor().execute(ctx);
    expect(result.output).toEqual({ eventType: 'created', recordId: 'r-1' });
  });
});

describe('BlockExecutor', () => {
  const executor = new BlockExecutor();

  it('透传到首个出边目标（分支容器内首个业务节点）', async () => {
    const ctx = makeCtx({ outgoingEdges: [makeEdge('b0', 'child-1'), makeEdge('b0', 'child-2')] });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['child-1']);
  });

  it('无出边：令牌终止', async () => {
    const result = await executor.execute(makeCtx());
    expect(result.nextNodeIds).toEqual([]);
  });
});

describe('ConditionExecutor', () => {
  const executor = new ConditionExecutor();

  it('命中首个满足条件的分支 label 并路由对应出边', async () => {
    const ctx = makeCtx({
      node: {
        id: 'c0',
        type: 'condition',
        meta: {},
        data: {
          conditions: [
            { label: 'APPROVED', condition: { '==': [{ var: 'decision' }, 'APPROVED'] } },
            { label: 'else', condition: null },
          ],
        },
      } as ExecutionContext['node'],
      outgoingEdges: [
        makeEdge('c0', 'a', { label: 'APPROVED' }),
        makeEdge('c0', 'b', { label: 'else' }),
      ],
      variables: { decision: 'APPROVED' },
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['a']);
  });

  it('无命中走 else 分支', async () => {
    const ctx = makeCtx({
      node: {
        id: 'c0',
        type: 'condition',
        meta: {},
        data: {
          conditions: [
            { label: 'APPROVED', condition: { '==': [{ var: 'decision' }, 'APPROVED'] } },
            { label: 'else', condition: null },
          ],
        },
      } as ExecutionContext['node'],
      outgoingEdges: [
        makeEdge('c0', 'a', { label: 'APPROVED' }),
        makeEdge('c0', 'b', { label: 'else' }),
      ],
      variables: { decision: 'REJECTED' },
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['b']);
  });

  it('无命中且无 else：降级取第一条出边（避免卡死）', async () => {
    const ctx = makeCtx({
      node: {
        id: 'c0',
        type: 'condition',
        meta: {},
        data: { conditions: [{ label: 'A', condition: { '==': [{ var: 'x' }, 1] } }] },
      } as ExecutionContext['node'],
      outgoingEdges: [makeEdge('c0', 'z')],
      variables: { x: 2 },
    });
    const result = await executor.execute(ctx);
    expect(result.nextNodeIds).toEqual(['z']);
  });
});

// ---------------------------------------------------------------------------
// user_task / delay / notification
// ---------------------------------------------------------------------------

describe('UserTaskExecutor', () => {
  const executor = new UserTaskExecutor();
  const prisma = getMockPrisma();

  beforeEach(() => {
    prisma.processTask.create.mockResolvedValue({ id: 'task-1' });
  });

  it('创建 PENDING 任务并返回 wait=true', async () => {
    const ctx = makeCtx({
      node: {
        id: 'ut-1',
        type: 'user_task',
        meta: {},
        data: { taskName: '审批', assignee: 'user-1', candidateGroups: ['role-1'] },
      } as ExecutionContext['node'],
    });
    const result = await executor.execute(ctx);

    expect(result.wait).toBe(true);
    expect(result.output).toEqual({ taskId: 'task-1', assignee: 'user-1' });
    const arg = prisma.processTask.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      taskName: '审批',
      assignee: 'user-1',
      candidateGroups: ['role-1'],
      status: 'PENDING',
      instanceId: 'pi-1',
      nodeId: 'ut-1',
    });
  });
});

describe('DelayExecutor', () => {
  const executor = new DelayExecutor();

  it('延时 > 0：调度 BullMQ delayed job 并 wait', async () => {
    const scheduleDelay = vi.fn();
    const ctx = makeCtx({
      node: {
        id: 'd0',
        type: 'delay',
        meta: {},
        data: { duration: 5, unit: 'MINUTES' },
      } as ExecutionContext['node'],
      scheduleDelay,
    });
    const result = await executor.execute(ctx);

    expect(result.wait).toBe(true);
    expect(scheduleDelay).toHaveBeenCalledWith('pi-1', 'd0', 300_000);
  });

  it('延时 = 0：直接通过', async () => {
    const scheduleDelay = vi.fn();
    const ctx = makeCtx({
      node: {
        id: 'd0',
        type: 'delay',
        meta: {},
        data: { duration: 0 },
      } as ExecutionContext['node'],
      scheduleDelay,
    });
    const result = await executor.execute(ctx);
    expect(result.wait).toBeFalsy();
    expect(scheduleDelay).not.toHaveBeenCalled();
  });
});

describe('NotificationExecutor', () => {
  const prisma = getMockPrisma();
  let mailService: { sendMail: ReturnType<typeof vi.fn> };
  let inApp: { create: ReturnType<typeof vi.fn> };
  let executor: NotificationExecutor;

  beforeEach(() => {
    mailService = { sendMail: vi.fn().mockResolvedValue(true) };
    inApp = { create: vi.fn().mockResolvedValue(1) };
    executor = new NotificationExecutor(mailService as never, inApp as never);
  });

  function makeNotificationCtx(
    data: Record<string, unknown>,
    variables: Record<string, unknown> = {},
  ) {
    return makeCtx({
      node: { id: 'ntf-1', type: 'notification', meta: {}, data } as ExecutionContext['node'],
      variables,
    });
  }

  it('IN_APP：站内信写入', async () => {
    const result = await executor.execute(
      makeNotificationCtx({
        channel: 'IN_APP',
        recipients: ['user-1'],
        title: '通知',
        content: '内容 {{name}}',
      }),
    );
    expect(inApp.create).toHaveBeenCalledOnce();
    expect(result.output).toMatchObject({ success: true, channel: 'IN_APP' });
  });

  it('收件人模板解析：{{record.created_by}} 解析为变量值并剔除空项', async () => {
    const result = await executor.execute(
      makeNotificationCtx(
        {
          channel: 'IN_APP',
          recipients: ['{{record.created_by}}'],
          title: 'T',
          content: 'C',
        },
        { record: { created_by: 'user-9' } },
      ),
    );
    expect(inApp.create).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-9'] }));
    expect(result.output).toMatchObject({ success: true });
  });

  it('EMAIL：经 MailService 发送', async () => {
    const result = await executor.execute(
      makeNotificationCtx({
        channel: 'EMAIL',
        recipients: ['a@b.c'],
        title: 'T',
        content: 'C',
      }),
    );
    expect(mailService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@b.c'], subject: 'T' }),
    );
    expect(result.output).toMatchObject({ success: true });
  });

  it('模版模式：加载 NotificationTemplate 并渲染', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      titleTemplate: '审批 {{record.id}}',
      bodyTemplate: '已通过',
    });
    const result = await executor.execute(
      makeNotificationCtx(
        { templateId: 'tpl-1', channel: 'IN_APP', recipients: ['u'] },
        { record: { id: 'r-1' } },
      ),
    );
    expect(inApp.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '审批 r-1', body: '已通过' }),
    );
    expect(result.output).toMatchObject({ success: true });
  });
});

// ---------------------------------------------------------------------------
// http_request / object_operation / sub_process
// ---------------------------------------------------------------------------

describe('HttpRequestExecutor', () => {
  const fetchMock = vi.fn();
  let executor: HttpRequestExecutor;
  const connectorService = { getEntity: vi.fn() };
  const callService = { invoke: vi.fn() };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    executor = new HttpRequestExecutor(connectorService as never, callService as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('直连模式：GET JSON 响应 + success 判定', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { forEach: () => undefined },
      text: async () => JSON.stringify({ id: 1 }),
    });
    const ctx = makeCtx({
      node: {
        id: 'h0',
        type: 'http_request',
        meta: {},
        data: { method: 'GET', url: 'https://x.test/api' },
      } as ExecutionContext['node'],
    });
    const result = await executor.execute(ctx);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.test/api',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.output).toMatchObject({
      statusCode: 200,
      success: true,
      responseBody: { id: 1 },
    });
  });

  it('缺 url 且无 connectorId：抛错', async () => {
    const ctx = makeCtx({
      node: { id: 'h0', type: 'http_request', meta: {}, data: {} } as ExecutionContext['node'],
    });
    await expect(executor.execute(ctx)).rejects.toThrow('缺少 url 或 connectorId');
  });
});

describe('ObjectOperationExecutor', () => {
  const prisma = getMockPrisma();
  /** 记录写内核 mock（评审 P1-5：执行器必须经 RecordService 写库） */
  const recordService = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    batchDelete: vi.fn(),
  };
  const executor = new ObjectOperationExecutor(recordService as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-1', tenantId: 't-1', appId: 'app-1' });
  });

  it('create：经记录写内核写入并返回 recordId（自动编号/公式/Rollup/事件由内核保证）', async () => {
    recordService.create.mockResolvedValue({ id: 'rec-9', data: { name: 'a' } });
    const ctx = makeCtx({
      node: {
        id: 'o0',
        type: 'object_operation',
        meta: {},
        data: { operation: 'create', objectId: 'obj-1' },
      } as ExecutionContext['node'],
      inputs: { name: 'a' },
    });
    const result = await executor.execute(ctx);
    expect(result.output).toMatchObject({ recordId: 'rec-9' });
    expect(recordService.create).toHaveBeenCalledWith('t-1', 'obj-1', 'system', { name: 'a' });
    // 不得再直接写库（否则绕过校验/公式/事件）
    expect(prisma.record.create).not.toHaveBeenCalled();
  });

  it('create：发起人存在时以其为用户上下文（triggerContext.triggeredByUser）', async () => {
    recordService.create.mockResolvedValue({ id: 'rec-10', data: {} });
    const ctx = makeCtx({
      node: {
        id: 'o0',
        type: 'object_operation',
        meta: {},
        data: { operation: 'create', objectId: 'obj-1' },
      } as ExecutionContext['node'],
      inputs: { name: 'b' },
    });
    ctx.instance.triggerContext = { triggeredByUser: 'user-42' };
    await executor.execute(ctx);
    expect(recordService.create).toHaveBeenCalledWith('t-1', 'obj-1', 'user-42', { name: 'b' });
  });

  it('delete（filter 范围）：解析受影响 id 后经批量删除内核（触发删除事件）', async () => {
    recordService.batchDelete.mockResolvedValue({ deleted: 2, errors: [] });
    prisma.record.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const ctx = makeCtx({
      node: {
        id: 'o0',
        type: 'object_operation',
        meta: {},
        data: {
          operation: 'delete',
          objectId: 'obj-1',
          filter: { '==': [{ var: 'status' }, 'SCRAPPED'] },
        },
      } as ExecutionContext['node'],
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ affectedCount: 2 });
    expect(recordService.batchDelete).toHaveBeenCalledWith('t-1', ['r1', 'r2']);
    expect(prisma.record.deleteMany).not.toHaveBeenCalled();
  });

  it('update：经记录写内核（部分更新 merge + 公式/Rollup/事件）', async () => {
    recordService.update.mockResolvedValue({ id: 'r1', data: { status: 'DONE' } });
    const ctx = makeCtx({
      node: {
        id: 'o0',
        type: 'object_operation',
        meta: {},
        data: { operation: 'update', objectId: 'obj-1' },
      } as ExecutionContext['node'],
      inputs: { recordId: 'r1', status: 'DONE' },
    });
    const result = await executor.execute(ctx);
    expect(result.output).toEqual({ affectedCount: 1, recordId: 'r1' });
    // recordId 不作为业务字段写入
    expect(recordService.update).toHaveBeenCalledWith('t-1', 'r1', 'system', { status: 'DONE' });
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });

  it('update：未命中记录时显式失败（保留原有防呆语义）', async () => {
    recordService.update.mockRejectedValue(new NotFoundException('记录不存在'));
    const ctx = makeCtx({
      node: {
        id: 'o0',
        type: 'object_operation',
        meta: {},
        data: { operation: 'update', objectId: 'obj-1' },
      } as ExecutionContext['node'],
      inputs: { recordId: 'missing', status: 'X' },
    });
    await expect(executor.execute(ctx)).rejects.toThrow('未命中任何记录');
  });

  it('query：按 JsonLogic filter 查询', async () => {
    prisma.record.findMany.mockResolvedValue([{ id: 'r1', data: { status: 'A' } }]);
    const ctx = makeCtx({
      node: {
        id: 'o0',
        type: 'object_operation',
        meta: {},
        data: {
          operation: 'query',
          objectId: 'obj-1',
          filter: { '==': [{ var: 'status' }, 'A'] },
        },
      } as ExecutionContext['node'],
    });
    const result = await executor.execute(ctx);
    expect(result.output).toMatchObject({ count: 1 });
    const arg = prisma.record.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({ tenantId: 't-1', objectId: 'obj-1' });
  });

  it('缺 objectId：抛错', async () => {
    const ctx = makeCtx({
      node: { id: 'o0', type: 'object_operation', meta: {}, data: {} } as ExecutionContext['node'],
    });
    await expect(executor.execute(ctx)).rejects.toThrow('缺少 objectId');
  });
});

describe('SubProcessExecutor', () => {
  const prisma = getMockPrisma();
  const executor = new SubProcessExecutor();

  beforeEach(() => {
    prisma.processDef.findFirst.mockResolvedValue({ id: 'sub-def-1', apiName: 'sub_flow' });
  });

  it('默认同步：triggerContext 写入 _parent 并 wait=true', async () => {
    const startSubProcess = vi.fn().mockResolvedValue('sub-instance-1');
    const ctx = makeCtx({
      node: {
        id: 'sp-1',
        type: 'sub_process',
        meta: {},
        data: { subProcessKey: 'sub_flow' },
      } as ExecutionContext['node'],
      startSubProcess,
    });
    const result = await executor.execute(ctx);

    expect(result.wait).toBe(true);
    expect(result.output).toMatchObject({ subInstanceId: 'sub-instance-1', sync: true });
    expect(startSubProcess).toHaveBeenCalledWith(
      'sub-def-1',
      expect.objectContaining({
        triggeredBy: 'SUB_PROCESS',
        _parent: { instanceId: 'pi-1', nodeId: 'sp-1' },
      }),
    );
  });

  it('sync=false：异步模式不等待', async () => {
    const startSubProcess = vi.fn().mockResolvedValue('sub-2');
    const ctx = makeCtx({
      node: {
        id: 'sp-1',
        type: 'sub_process',
        meta: {},
        data: { subProcessKey: 'sub_flow', sync: false },
      } as ExecutionContext['node'],
      startSubProcess,
    });
    const result = await executor.execute(ctx);

    expect(result.wait).toBeFalsy();
    const arg = startSubProcess.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg['_parent']).toBeUndefined();
  });

  it('子流程未找到：抛错', async () => {
    prisma.processDef.findFirst.mockResolvedValue(null);
    const ctx = makeCtx({
      node: {
        id: 'sp-1',
        type: 'sub_process',
        meta: {},
        data: { subProcessKey: 'missing' },
      } as ExecutionContext['node'],
    });
    await expect(executor.execute(ctx)).rejects.toThrow('未找到或未发布');
  });
});
