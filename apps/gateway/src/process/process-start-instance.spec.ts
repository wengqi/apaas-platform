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
  const engine = { startProcess: vi.fn().mockResolvedValue('inst-1') };

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

  it('显式传入优先：req.triggeredByUser 原样保留', async () => {
    await makeService(engine).startInstance(TENANT, 'p-1', { triggeredByUser: 'user-x' }, 'user-9');
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'p-1',
      expect.objectContaining({ triggerType: 'MANUAL', triggeredByUser: 'user-x' }),
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
});
