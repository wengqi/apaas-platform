/**
 * A3 单测（流程引擎专题 R1，2026-10-11）—— MANUAL 启动注入发起人。
 *
 * 缺陷：startInstance 的 triggerContext.triggeredByUser 仅取调用方显式传入
 * （原 `req.triggeredByUser ?? null`），studio 手动启动只传 {processKey, variables}
 * → 实例无发起人：「我发起的」不可见、兜底通知无收件人、INITIATOR 审批节点无发起人可用。
 * 修复语义：显式传入优先，用户身份上下文兜底（callerUserId）；
 * OpenAPI 路径不经过本方法（open-api.controller 直调 engine.startProcess，
 * 服务身份场景保留显式语义），不受影响。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockPrisma } from '../test/test-helpers.js';
import { BadRequestException } from '@nestjs/common';
import { ProcessService } from './process.service.js';

const TENANT = 'tenant-001';

function makeService(engine: { startProcess: ReturnType<typeof vi.fn> }) {
  return new ProcessService(
    engine as unknown as ConstructorParameters<typeof ProcessService>[0],
    {} as unknown as ConstructorParameters<typeof ProcessService>[1],
    {} as unknown as ConstructorParameters<typeof ProcessService>[2],
  );
}

describe('ProcessService.startInstance 发起人注入（A3）', () => {
  const prisma = getMockPrisma();
  const engine = {
    startProcess: vi.fn().mockResolvedValue('inst-1'),
    cancelProcess: vi.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine.startProcess.mockResolvedValue('inst-1');
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-1',
      tenantId: TENANT,
      processDefId: 'def-1',
      environmentId: 'prod',
      frozenWorkflowSchema: null,
      triggerContext: { triggerType: 'MANUAL' },
      variables: {},
      status: 'RUNNING',
      activeNodeIds: [],
      startedAt: new Date('2026-10-11T00:00:00Z'),
      finishedAt: null,
      error: null,
      timedOut: false,
      processDef: { name: '审批', apiName: 'approval', version: 1 },
    });
  });

  it('PE-03：JWT 用户通道 caller 强制覆盖 body 伪造值（防「我发起的」污染/越权撤回）', async () => {
    await makeService(engine).startInstance(TENANT, 'p-1', { triggeredByUser: 'user-x' }, 'user-9');
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'p-1',
      expect.objectContaining({ triggerType: 'MANUAL', triggeredByUser: 'user-9' }),
    );
  });

  it('PE-03：无 caller（服务身份通道）显式 triggeredByUser 保留（A3/G6 语义）', async () => {
    await makeService(engine).startInstance(TENANT, 'p-1', { triggeredByUser: 'svc-user' });
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'p-1',
      expect.objectContaining({ triggeredByUser: 'svc-user' }),
    );
  });

  it('未显式传入时兜底调用方用户身份（callerUserId）', async () => {
    await makeService(engine).startInstance(TENANT, 'p-1', { variables: {} }, 'user-9');
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'p-1',
      expect.objectContaining({ triggeredByUser: 'user-9' }),
    );
  });

  it('两者皆无（内部调用）→ null 兼容', async () => {
    await makeService(engine).startInstance(TENANT, 'p-1', {});
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'p-1',
      expect.objectContaining({ triggeredByUser: null }),
    );
  });

  // ---------------------------------------------------------------------
  // PE-02：cancelInstance 归属校验（超管/发起人/任务参与人；对齐可见性口径）
  // ---------------------------------------------------------------------
  it('PE-02：无归属用户取消他人实例 → 403 且不调引擎', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-9',
      tenantId: TENANT,
      triggerContext: { triggeredByUser: 'owner-1' },
      status: 'RUNNING',
      tasks: [{ assignee: 'assignee-1', candidateGroups: [] }],
    });
    prisma.user.findFirst.mockResolvedValue({ isPlatformAdmin: false });
    prisma.userRole.findMany.mockResolvedValue([]);

    const svc = makeService(engine);
    await expect(svc.cancelInstance(TENANT, 'inst-9', 'stranger-1')).rejects.toThrow(
      /仅发起人|参与人|管理员/,
    );
    expect(engine.startProcess).not.toHaveBeenCalled();
  });

  it('PE-02：发起人可取消', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-9',
      tenantId: TENANT,
      triggerContext: { triggeredByUser: 'owner-1' },
      status: 'RUNNING',
      tasks: [],
    });
    prisma.user.findFirst.mockResolvedValue({ isPlatformAdmin: false });
    prisma.userRole.findMany.mockResolvedValue([]);

    await makeService(engine).cancelInstance(TENANT, 'inst-9', 'owner-1');
    expect(engine.cancelProcess).toHaveBeenCalledWith('inst-9', TENANT);
  });

  it('PE-02：任务受理人可取消', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-9',
      tenantId: TENANT,
      triggerContext: { triggeredByUser: 'owner-1' },
      status: 'RUNNING',
      tasks: [{ assignee: 'assignee-1', candidateGroups: [] }],
    });
    prisma.user.findFirst.mockResolvedValue({ isPlatformAdmin: false });
    prisma.userRole.findMany.mockResolvedValue([]);

    await makeService(engine).cancelInstance(TENANT, 'inst-9', 'assignee-1');
    expect(engine.cancelProcess).toHaveBeenCalledWith('inst-9', TENANT);
  });

  it('PE-02：内部调用（无 userId）不限制（既有定时/系统路径兼容）', async () => {
    prisma.processInstance.findFirst.mockResolvedValue({
      id: 'inst-9',
      tenantId: TENANT,
      triggerContext: {},
      status: 'RUNNING',
      tasks: [],
    });

    await makeService(engine).cancelInstance(TENANT, 'inst-9');
    expect(engine.cancelProcess).toHaveBeenCalledWith('inst-9', TENANT);
  });

  // ---------------------------------------------------------------------
  // PE-01 ①/②（◆1=a+c）：手动启动闸 + 启动变量保留键剥离
  // ---------------------------------------------------------------------
  const triggerSchema = (triggerType: string | undefined) => ({
    nodes: [
      ...(triggerType ? [{ id: 'tg', type: 'trigger', data: { title: '触发', triggerType } }] : []),
      { id: 's', type: 'start', data: {} },
      { id: 'e', type: 'end', data: {} },
    ],
    edges: [{ sourceNodeID: 's', targetNodeID: 'e' }],
  });

  it('PE-01①：RECORD_CREATED 流程手动启动 → 400（判定源=schema 触发节点）', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      tenantId: TENANT,
      triggerType: 'MANUAL', // 顶层列不同步（画布形状）——判定必须走 schema 触发节点
      workflowSchema: triggerSchema('RECORD_CREATED'),
    });
    await expect(makeService(engine).assertManualStartable(TENANT, 'pd-1')).rejects.toThrow(
      /该流程为 RECORD_CREATED 触发，不支持手动启动/,
    );
  });

  it('PE-01①：MANUAL/SCHEDULED 触发与种子回退（无触发节点+顶层列）放行', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      tenantId: TENANT,
      triggerType: 'MANUAL',
      workflowSchema: triggerSchema('MANUAL'),
    });
    await expect(
      makeService(engine).assertManualStartable(TENANT, 'pd-1'),
    ).resolves.toBeUndefined();

    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-2',
      tenantId: TENANT,
      triggerType: 'SCHEDULED',
      workflowSchema: triggerSchema('SCHEDULED'),
    });
    await expect(
      makeService(engine).assertManualStartable(TENANT, 'pd-2'),
    ).resolves.toBeUndefined();

    // 种子/AI 建流：无触发节点，顶层列 MANUAL 回退
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-3',
      tenantId: TENANT,
      triggerType: 'MANUAL',
      workflowSchema: triggerSchema(undefined),
    });
    await expect(
      makeService(engine).assertManualStartable(TENANT, 'pd-3'),
    ).resolves.toBeUndefined();

    // 无触发节点但顶层列=RECORD_CREATED → 回退判定同样拦（按列实现则越权链修而存活）
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-4',
      tenantId: TENANT,
      triggerType: 'RECORD_CREATED',
      workflowSchema: triggerSchema(undefined),
    });
    await expect(makeService(engine).assertManualStartable(TENANT, 'pd-4')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('PE-01②：启动变量剥离引擎保留键全谱（recordId/sequentialIndex/global/_joins）', async () => {
    await makeService(engine).startInstance(
      TENANT,
      'p-1',
      {
        variables: {
          recordId: 'rec-hack',
          sequentialIndex: 2,
          global: { x: 1 },
          _joins: {},
          name: 'A',
        },
      },
      'user-9',
    );
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'p-1',
      expect.objectContaining({ inputs: { name: 'A' } }),
    );
  });

  it('PE-01①：listPublishedProcesses 投影 manualStartable（触发节点判定，顶层列回退）', async () => {
    prisma.processDef.findMany.mockResolvedValue([
      {
        id: 'a',
        tenantId: TENANT,
        appId: 'app-1',
        apiName: 'rec_flow',
        name: '记录流',
        version: 1,
        status: 'PUBLISHED',
        triggerType: 'MANUAL',
        cron: null,
        workflowSchema: triggerSchema('RECORD_CREATED'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'b',
        tenantId: TENANT,
        appId: 'app-1',
        apiName: 'manual_flow',
        name: '手动流',
        version: 1,
        status: 'PUBLISHED',
        triggerType: 'MANUAL',
        cron: null,
        workflowSchema: triggerSchema('MANUAL'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const dtos = await makeService(engine).listPublishedProcesses(TENANT, 'app-1');
    const byId = Object.fromEntries(
      dtos.map((d: { id: string; manualStartable: boolean }) => [d.id, d.manualStartable]),
    );
    expect(byId['a']).toBe(false);
    expect(byId['b']).toBe(true);
  });
});
