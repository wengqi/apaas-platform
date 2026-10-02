/**
 * 单元测试 — 审计日志服务（ROADMAP 9.9 应用级审计）。
 *
 * 覆盖：appId 过滤下推、平台级事件（appId=null）写入、DTO 透出 appId。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditLogService } from './audit-log.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

describe('AuditLogService — 应用维度（ROADMAP 9.9）', () => {
  const prisma = getMockPrisma();
  const service = new AuditLogService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('query：提供 appId 时下推到 where（应用级审计页）', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.query({ tenantId: 't-1', page: 1, pageSize: 20, appId: 'app-9' });

    const arg = prisma.auditLog.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({ tenantId: 't-1', appId: 'app-9' });
  });

  it('query：未提供 appId 时不注入该条件（平台级视图）', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.query({ tenantId: 't-1', page: 1, pageSize: 20 });

    const arg = prisma.auditLog.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).toEqual({ tenantId: 't-1' });
  });

  it('log：appId 写入 data；省略时写 null（平台级事件）', async () => {
    prisma.auditLog.create.mockResolvedValue({});

    await service.log({
      tenantId: 't-1',
      userId: 'u-1',
      action: 'RECORD_CREATE',
      resource: 'RECORD',
      resourceId: 'r-1',
      appId: 'app-9',
    });
    expect(prisma.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ appId: 'app-9' }),
    });

    await service.log({ tenantId: 't-1', userId: 'u-1', action: 'PERMISSION_CHECK' });
    expect(prisma.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ appId: null }),
    });
  });

  it('query：DTO 透出 appId，便于前端按应用展示', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a-1',
        userId: 'u-1',
        action: 'RECORD_CREATE',
        resource: 'RECORD',
        resourceId: 'r-1',
        appId: 'app-9',
        detail: { objectId: 'o-1' },
        ip: null,
        createdAt: new Date('2026-09-27T00:00:00.000Z'),
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.query({ tenantId: 't-1', page: 1, pageSize: 20, appId: 'app-9' });
    expect(result.items[0]).toMatchObject({ appId: 'app-9', action: 'RECORD_CREATE' });
  });
});

describe('AuditLogService — 审计分类过滤（P1 运维治理）', () => {
  const prisma = getMockPrisma();
  const service = new AuditLogService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('query：category 展开为 action IN（SSOT：shared AUDIT_ACTION_CATEGORIES）', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);

    await service.query({ tenantId: 't-1', page: 1, pageSize: 20, category: 'RECORD' });

    const arg = prisma.auditLog.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({ tenantId: 't-1' });
    expect((arg.where.action as { in: string[] }).in).toEqual(
      expect.arrayContaining(['RECORD_CREATE', 'RECORD_UPDATE', 'RECORD_DELETE']),
    );
  });

  it('log：请求 ALS 内自动采纳 traceId（测试上下文为 null → 落 null）', async () => {
    prisma.auditLog.create.mockResolvedValue({});
    await service.log({ tenantId: 't-1', userId: 'u-1', action: 'APP_PUBLISH' });
    const arg = prisma.auditLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({ action: 'APP_PUBLISH', traceId: null });
  });
});
