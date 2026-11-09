/**
 * ProcessService 单元测试 — 流程定义删除（P1-30）。
 *
 * P1-30（对抗审查 R1-compat-07）：processDefId 在 process_api_releases 表无 FK，
 * 删除流程后 release 行残留——发现端点继续 advertise 已删流程、调用引擎层 400 悬空。
 * 修复契约：删除流程时级联处置该流程的全部 API release 行（未上线零兼容，直接级联删）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProcessService } from './process.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

function createMockChangeLogService() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function createMockTriggerService() {
  return {
    onRecordEvent: vi.fn().mockResolvedValue(undefined),
    onProcessUnpublished: vi.fn().mockResolvedValue(undefined),
  };
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

  it('R-B functional-01：存在任何实例 → 409 硬拦（含计数与指引，◆1=A）', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'DRAFT',
    });
    prisma.processInstance.count.mockResolvedValue(7);

    const { service } = createService();
    await expect(service.deleteProcess('t1', 'app-1', 'pd-1')).rejects.toThrow(/存在 7 条实例/);
    expect(prisma.processInstance.count).toHaveBeenCalledWith({
      where: { processDefId: 'pd-1', tenantId: 't1' },
    });
    expect(prisma.processDef.delete).not.toHaveBeenCalled();
  });

  it('R-B functional-01：无实例正常删除（计数放行，级联链保持）', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'DRAFT',
    });
    prisma.processInstance.count.mockResolvedValue(0);

    const { service } = createService();
    await service.deleteProcess('t1', 'app-1', 'pd-1');

    expect(prisma.processApiRelease.deleteMany).toHaveBeenCalled();
    expect(prisma.processDef.delete).toHaveBeenCalledWith({ where: { id: 'pd-1' } });
  });

  it('R-B functional-05：通知模版被 notification 节点引用 → 409 含流程清单', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      appId: 'app-1',
      name: '通过通知',
    });
    prisma.processDef.findMany.mockResolvedValue([
      {
        id: 'pd-9',
        name: '采购审批',
        workflowSchema: {
          nodes: [
            {
              id: 'n2',
              type: 'notification',
              data: { channel: 'IN_APP', recipients: ['u1'], templateId: 'tpl-1' },
            },
          ],
        },
      },
      {
        id: 'pd-8',
        name: '无引用流程',
        workflowSchema: {
          nodes: [
            {
              id: 'n3',
              type: 'notification',
              data: { channel: 'IN_APP', recipients: ['u1'], templateId: 'tpl-other' },
            },
          ],
        },
      },
    ]);

    const { service } = createService();
    await expect(service.deleteTemplate('t1', 'app-1', 'tpl-1')).rejects.toThrow(/采购审批/);
    await expect(service.deleteTemplate('t1', 'app-1', 'tpl-1')).rejects.toThrow(ConflictException);
    expect(prisma.notificationTemplate.delete).not.toHaveBeenCalled();
  });

  it('R-B functional-05：无引用模版可正常删除', async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      appId: 'app-1',
      name: '通过通知',
    });
    prisma.processDef.findMany.mockResolvedValue([]);

    const { service } = createService();
    await service.deleteTemplate('t1', 'app-1', 'tpl-1');

    expect(prisma.notificationTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
  });

  it('R-B functional-09：SCHEDULED 无 cron 发布硬拦（预检 400 含 reason）', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'DRAFT',
      workflowSchema: {
        nodes: [
          { id: 'n1', type: 'trigger', data: { title: '触发', triggerType: 'SCHEDULED' } },
          { id: 'n2', type: 'end', data: { title: '结束' } },
        ],
        edges: [],
      },
    });

    const { service } = createService();
    const err = (await service.publishProcess('t1', 'app-1', 'pd-1').catch((e: unknown) => e)) as {
      getResponse: () => { message: string };
    };
    expect(err.getResponse().message).toContain('定时触发未配置 Cron 表达式');
    expect(prisma.processDef.update).not.toHaveBeenCalled();
  });

  it('PE-07：PUT 降级遇 ACTIVE release → 400 指向退役端点', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'PUBLISHED',
      triggerType: null,
      cron: null,
    });
    prisma.processApiRelease.findFirst.mockResolvedValue({ id: 'rel-1' });

    const { service } = createService();
    await expect(service.updateProcess('t1', 'app-1', 'pd-1', { name: 'X' })).rejects.toThrow(
      /release\/retire/,
    );
    expect(prisma.processDef.update).not.toHaveBeenCalled();
  });

  it('PE-07：retire——ACTIVE→DEPRECATED + changelog', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'PUBLISHED',
      triggerType: null,
      cron: null,
    });
    prisma.processApiRelease.updateMany.mockResolvedValue({ count: 2 });

    const { service, changeLogService } = createService();
    const r = await service.retireProcessApiRelease('t1', 'app-1', 'pd-1', 'admin');
    expect(r).toEqual({ retired: true, count: 2 });
    expect(prisma.processApiRelease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
        data: { status: 'DEPRECATED' },
      }),
    );
    expect(changeLogService.log).toHaveBeenCalled();
  });

  it('PE-07：retire 无 ACTIVE 发布 → 400 无需退役', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'PUBLISHED',
      triggerType: null,
      cron: null,
    });
    prisma.processApiRelease.updateMany.mockResolvedValue({ count: 0 });

    const { service } = createService();
    await expect(service.retireProcessApiRelease('t1', 'app-1', 'pd-1')).rejects.toThrow(
      /无需退役/,
    );
  });

  it('PE-07：archive——PUBLISHED 无 ACTIVE → ARCHIVED 写入点；有 ACTIVE → 400 指向退役', async () => {
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      appId: 'app-1',
      name: 'F',
      status: 'PUBLISHED',
      triggerType: null,
      cron: null,
    });
    prisma.processApiRelease.findFirst.mockResolvedValue(null);

    const { service } = createService();
    const r = await service.archiveProcess('t1', 'app-1', 'pd-1');
    expect(r).toEqual({ archived: true });
    expect(prisma.processDef.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ARCHIVED' } }),
    );

    prisma.processApiRelease.findFirst.mockResolvedValue({ id: 'rel-1' });
    await expect(service.archiveProcess('t1', 'app-1', 'pd-1')).rejects.toThrow(/release\/retire/);
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
