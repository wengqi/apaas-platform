/**
 * ProcessApiReleaseService 单测（G6 版本稳定性承诺）。
 *
 * 核心断言：
 * 1. 首发 major=1：冻结当前 PUBLISHED schema
 * 2. 新 major：对上一 major 跑 diff + 旧 major 置 DEPRECATED（仍可调）
 * 3. 非 API 触发类型 / 未发布 / 重复 major → 拒绝
 * 4. resolve：钉 major 精确匹配（含 DEPRECATED 仍可调）/ 未钉取最新 ACTIVE
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProcessApiReleaseService } from './process-api-release.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const APP = 'app-1';
const TENANT = 't1';

const API_DEF = {
  id: 'pd-1',
  tenantId: TENANT,
  appId: APP,
  apiName: 'order_flow',
  name: '订单流',
  status: 'PUBLISHED',
  triggerType: 'API',
  version: 3,
  workflowSchema: { nodes: [{ id: 's', type: 'start' }], edges: [] },
  cron: null,
};

function makeService() {
  const prisma = getMockPrisma();
  const svc = new ProcessApiReleaseService();
  return { svc, prisma };
}

describe('release（发布）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('首发 major=1：冻结 schema + 无 diff', async () => {
    const { svc, prisma } = makeService();
    prisma.processDef.findFirst.mockResolvedValue(API_DEF);
    prisma.processApiRelease.findFirst
      .mockResolvedValueOnce(null) // dup check
      .mockResolvedValueOnce(null); // previous
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        processApiRelease: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({
            id: 'rel-1',
            appId: APP,
            processDefId: 'pd-1',
            apiName: 'order_flow',
            majorVersion: 1,
            status: 'ACTIVE',
            triggerType: 'API',
            releasedBy: 'u1',
            createdAt: new Date(),
            workflowSchema: {},
          }),
        },
      }),
    );

    const r = await svc.release(TENANT, APP, 'pd-1', 1, 'u1');
    expect(r.majorVersion).toBe(1);
    expect(r.diff).toBeNull();
    expect(r.deprecatedMajors).toEqual([]);
    const tx = prisma.$transaction.mock.calls[0]![0] as (tx: unknown) => unknown;
    void tx;
  });

  it('非 API 触发类型 → 拒绝', async () => {
    const { svc, prisma } = makeService();
    prisma.processDef.findFirst.mockResolvedValue({ ...API_DEF, triggerType: 'MANUAL' });
    await expect(svc.release(TENANT, APP, 'pd-1', 1, 'u1')).rejects.toThrow(BadRequestException);
  });

  it('未发布流程 → 拒绝', async () => {
    const { svc, prisma } = makeService();
    prisma.processDef.findFirst.mockResolvedValue({ ...API_DEF, status: 'DRAFT' });
    await expect(svc.release(TENANT, APP, 'pd-1', 1, 'u1')).rejects.toThrow(BadRequestException);
  });

  it('重复 major → 拒绝（发布后不可覆盖）', async () => {
    const { svc, prisma } = makeService();
    prisma.processDef.findFirst.mockResolvedValue(API_DEF);
    prisma.processApiRelease.findFirst.mockResolvedValueOnce({ id: 'rel-0', majorVersion: 1 });
    await expect(svc.release(TENANT, APP, 'pd-1', 1, 'u1')).rejects.toThrow(/v1 已存在/);
  });

  it('新 major：diff 返回 + 旧 ACTIVE 置 DEPRECATED', async () => {
    const { svc, prisma } = makeService();
    const v1Schema = {
      nodes: [
        { id: 's', type: 'start' },
        { id: 'ut', type: 'user_task' },
      ],
      edges: [],
    };
    prisma.processDef.findFirst.mockResolvedValue({ ...API_DEF, workflowSchema: v1Schema });
    prisma.processApiRelease.findFirst
      .mockResolvedValueOnce(null) // dup check（major=2 无冲突）
      .mockResolvedValueOnce({
        id: 'rel-1',
        majorVersion: 1,
        status: 'ACTIVE',
        workflowSchema: {
          apiName: 'order_flow',
          name: '订单流',
          workflowSchema: v1Schema,
          triggerType: 'API',
          cron: null,
        },
      });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({
      id: 'rel-2',
      appId: APP,
      processDefId: 'pd-1',
      apiName: 'order_flow',
      majorVersion: 2,
      status: 'ACTIVE',
      triggerType: 'API',
      releasedBy: 'u1',
      createdAt: new Date(),
      workflowSchema: {},
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ processApiRelease: { updateMany, create } }),
    );

    const r = await svc.release(TENANT, APP, 'pd-1', 2, 'u1');
    expect(r.majorVersion).toBe(2);
    expect(r.deprecatedMajors).toEqual([1]);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
    );
  });
});

describe('resolve（调用解析）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未钉 major → 最新 ACTIVE', async () => {
    const { svc, prisma } = makeService();
    prisma.processApiRelease.findFirst.mockResolvedValue({ id: 'rel-2', majorVersion: 2 });
    const r = await svc.resolve(TENANT, APP, 'order_flow');
    expect(r.majorVersion).toBe(2);
    expect(prisma.processApiRelease.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
    );
  });

  it('钉 major → 精确匹配（DEPRECATED 仍可调用——承诺本体）', async () => {
    const { svc, prisma } = makeService();
    prisma.processApiRelease.findFirst.mockResolvedValue({
      id: 'rel-1',
      majorVersion: 1,
      status: 'DEPRECATED',
    });
    const r = await svc.resolve(TENANT, APP, 'order_flow', 1);
    expect(r.majorVersion).toBe(1);
    expect(prisma.processApiRelease.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ majorVersion: 1 }) }),
    );
  });

  it('不存在 → NotFound', async () => {
    const { svc, prisma } = makeService();
    prisma.processApiRelease.findFirst.mockResolvedValue(null);
    await expect(svc.resolve(TENANT, APP, 'ghost', 1)).rejects.toThrow(NotFoundException);
  });
});
