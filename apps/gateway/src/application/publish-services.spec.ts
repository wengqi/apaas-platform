/**
 * 应用发布支撑服务单元测试 — snapshot / changelog / audit-log。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SnapshotService } from './snapshot.service.js';
import { ChangeLogService } from './changelog.service.js';
import { AuditLogService } from '../permission/audit-log.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

// ---------------------------------------------------------------------------
// SnapshotService
// ---------------------------------------------------------------------------

describe('SnapshotService', () => {
  const prisma = getMockPrisma();
  const service = new SnapshotService();

  beforeEach(() => {
    prisma.application.findFirst.mockResolvedValue({ id: 'app-1', name: '应用' });
    prisma.objectMeta.findMany.mockResolvedValue([{ id: 'obj-1', views: [] }]);
    prisma.pageMeta.findMany.mockResolvedValue([{ id: 'p-1' }]);
    prisma.processDef.findMany.mockResolvedValue([{ id: 'pr-1' }]);
    prisma.role.findMany
      .mockResolvedValueOnce([{ id: 'r-1', permissionRules: [] }]) // 应用级
      .mockResolvedValueOnce([{ id: 'r-0', permissionRules: [] }]); // 租户级
  });

  it('应用不存在：抛 NotFound', async () => {
    prisma.application.findFirst.mockResolvedValue(null);
    await expect(service.collectSnapshot('t-1', 'ghost', '1.0', 'u-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('收集对象/页面/流程/角色到快照', async () => {
    const snapshot = await service.collectSnapshot('t-1', 'app-1', '1.0.0', 'u-1');

    expect(snapshot.objects).toHaveLength(1);
    expect(snapshot.pages).toHaveLength(1);
    expect(snapshot.processes).toHaveLength(1);
    // 应用级 + 租户级角色都进快照（挂载于 permissions.roles）
    expect(snapshot.permissions?.roles).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// ChangeLogService
// ---------------------------------------------------------------------------

describe('ChangeLogService', () => {
  const prisma = getMockPrisma();
  const service = new ChangeLogService();

  it('log：正常写入', async () => {
    await service.log({
      tenantId: 't-1',
      appId: 'app-1',
      module: 'PAGE',
      entityType: 'PageMeta',
      entityId: 'p-1',
      entityName: '首页',
      changeType: 'CREATE',
      changedBy: 'u-1',
    });
    expect(prisma.changeLog.create).toHaveBeenCalledOnce();
  });

  it('log：写入失败静默吞掉（不阻塞主操作）', async () => {
    prisma.changeLog.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.log({
        tenantId: 't-1',
        appId: 'app-1',
        module: 'PAGE',
        entityType: 'PageMeta',
        entityId: 'p-1',
        changeType: 'CREATE',
        changedBy: 'u-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('getChangeSet：按模块分组并带上基线版本', async () => {
    prisma.appVersion.findFirst.mockResolvedValue({
      versionNumber: '1.2.0',
      publishedAt: new Date('2026-09-01'),
    });
    prisma.changeLog.findMany.mockResolvedValue([
      {
        module: 'PAGE',
        entityId: 'p-2',
        entityName: '新页',
        changeType: 'CREATE',
        changedBy: 'u-1',
        changedAt: new Date('2026-09-05'),
        changeDescription: '新增页面',
      },
      {
        module: 'PAGE',
        entityId: 'p-3',
        entityName: '删页',
        changeType: 'DELETE',
        changedBy: 'u-2',
        changedAt: new Date('2026-09-06'),
        changeDescription: null,
      },
      {
        module: 'OBJECT',
        entityId: 'obj-2',
        entityName: '新对象',
        changeType: 'CREATE',
        changedBy: 'u-1',
        changedAt: new Date('2026-09-06'),
        changeDescription: '',
      },
    ]);

    const changeSet = await service.getChangeSet('t-1', 'app-1');

    expect(changeSet.baselineVersion).toBe('1.2.0');
    const pageModule = changeSet.modules.find((m) => m.module === 'PAGE');
    expect(pageModule?.changes).toHaveLength(2);
    expect(changeSet.modules.find((m) => m.module === 'OBJECT')?.changes).toHaveLength(1);
  });

  it('getChangeSet：应用级变更（如新建应用）归入 APPLICATION 模块而非页面', async () => {
    // 双视角评审（2026-10-04）：应用级操作此前误标 module:'PAGE'，发布向导把"新建应用"归入页面组
    prisma.appVersion.findFirst.mockResolvedValue({
      versionNumber: '1.2.0',
      publishedAt: new Date('2026-09-01'),
    });
    prisma.changeLog.findMany.mockResolvedValue([
      {
        module: 'APPLICATION',
        entityId: 'app-1',
        entityName: '礼品申请',
        changeType: 'CREATE',
        changedBy: 'u-1',
        changedAt: new Date('2026-10-05'),
        changeDescription: '新建应用',
      },
    ]);

    const changeSet = await service.getChangeSet('t-1', 'app-1');

    expect(changeSet.modules).toHaveLength(1);
    expect(changeSet.modules[0]).toMatchObject({ module: 'APPLICATION' });
    expect(changeSet.modules[0]!.changes).toHaveLength(1);
  });

  it('getChangeSet：无发布历史时基线为 null 且查询全量日志', async () => {
    prisma.appVersion.findFirst.mockResolvedValue(null);
    prisma.changeLog.findMany.mockResolvedValue([]);
    const changeSet = await service.getChangeSet('t-1', 'app-1');
    expect(changeSet.baselineVersion).toBeNull();
    expect(changeSet.modules).toHaveLength(0);
    const arg = prisma.changeLog.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).not.toHaveProperty('changedAt');
  });
});

// ---------------------------------------------------------------------------
// AuditLogService
// ---------------------------------------------------------------------------

describe('AuditLogService', () => {
  const prisma = getMockPrisma();
  const service = new AuditLogService();

  beforeEach(() => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a-1',
        userId: 'u-1',
        action: 'CREATE',
        resource: 'Record',
        resourceId: 'r-1',
        detail: null,
        createdAt: new Date('2026-09-01'),
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);
  });

  it('query：分页 + 过滤条件注入 where', async () => {
    const result = await service.query({
      tenantId: 't-1',
      page: 2,
      pageSize: 20,
      action: 'CREATE',
      userId: 'u-1',
    });

    expect(result.total).toBe(1);
    const arg = prisma.auditLog.findMany.mock.calls[0]?.[0];
    expect(arg.where).toMatchObject({ tenantId: 't-1', action: 'CREATE', userId: 'u-1' });
    expect(arg.skip).toBe(20);
    expect(arg.take).toBe(20);
  });

  it('query：pageSize 超过上限时被钳制', async () => {
    await service.query({ tenantId: 't-1', page: 1, pageSize: 100000 });
    const arg = prisma.auditLog.findMany.mock.calls[0]?.[0];
    expect(arg.take).toBeLessThanOrEqual(100);
  });
});
