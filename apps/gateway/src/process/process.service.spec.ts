/**
 * ProcessService 单元测试 — 流程定义删除（P1-30）。
 *
 * P1-30（对抗审查 R1-compat-07）：processDefId 在 process_api_releases 表无 FK，
 * 删除流程后 release 行残留——发现端点继续 advertise 已删流程、调用引擎层 400 悬空。
 * 修复契约：删除流程时级联处置该流程的全部 API release 行（未上线零兼容，直接级联删）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProcessService } from './process.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

function createMockChangeLogService() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function createMockTriggerService() {
  return { onRecordEvent: vi.fn().mockResolvedValue(undefined) };
}

function createMockEngine() {
  return {
    startInstance: vi.fn(),
    getInstance: vi.fn(),
    listInstances: vi.fn(),
    cancelInstance: vi.fn(),
    listTasks: vi.fn(),
    completeTask: vi.fn(),
    delegateTask: vi.fn(),
  };
}

function createService() {
  const engine = createMockEngine();
  const changeLogService = createMockChangeLogService();
  const triggerService = createMockTriggerService();
  const service = new ProcessService(
    engine as unknown as ConstructorParameters<typeof ProcessService>[0],
    changeLogService as unknown as ConstructorParameters<typeof ProcessService>[1],
    triggerService as unknown as ConstructorParameters<typeof ProcessService>[2],
  );
  return { service, engine, changeLogService, triggerService };
}

describe('ProcessService deleteProcess（P1-30）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('已发布流程不可删除（既有语义保持）', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'PUBLISHED',
    });

    const { service } = createService();
    await expect(service.deleteProcess('t1', 'app-1', 'pd-1')).rejects.toThrow(BadRequestException);
    expect(prisma.processDef.delete).not.toHaveBeenCalled();
  });

  it('P1-15：发布硬闸拦截双 error 出边歧义（error 级，同一节点）', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'DRAFT',
      workflowSchema: {
        nodes: [
          { id: 'n1', type: 'start', data: { title: '开始' } },
          { id: 'n2', type: 'end', data: { title: '结束' } },
        ],
        edges: [
          { sourceNodeID: 'n1', targetNodeID: 'n2', label: 'error' },
          { sourceNodeID: 'n1', targetNodeID: 'n2', label: 'Error' },
        ],
      },
    });

    const { service } = createService();
    const err = (await service.publishProcess('t1', 'app-1', 'pd-1').catch((e: unknown) => e)) as {
      getResponse: () => { message: string };
    };
    expect(err.getResponse()).toEqual(
      expect.objectContaining({ message: expect.stringContaining('error 出边歧义') }),
    );
    expect(prisma.processDef.update).not.toHaveBeenCalled();
  });

  it('P1-30：删除流程时级联处置该流程的全部 API release 行', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'DRAFT',
    });

    const { service, changeLogService } = createService();
    await service.deleteProcess('t1', 'app-1', 'pd-1');

    expect(prisma.processApiRelease.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', appId: 'app-1', processDefId: 'pd-1' },
    });
    expect(prisma.processDef.delete).toHaveBeenCalledWith({ where: { id: 'pd-1' } });
    expect(changeLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'DELETE' }),
    );
  });
});
