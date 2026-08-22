/**
 * ApplicationService 单元测试 — 应用 CRUD + 发布/回滚。
 *
 * 测试覆盖：
 * - list（含资源统计 _count）
 * - get（存在性校验）
 * - create（apiName 自动生成 + 默认状态 DRAFT + ChangeLog）
 * - update（updateMany + ChangeLog）
 * - delete（DRAFT 可删 / PUBLISHED 拒绝 / ARCHIVED 检查在途流程）
 * - archive（PUBLISHED 可归档 / DEVELOPMENT 拒绝）
 * - publish（版本号校验 + 预检 + 快照 + 事务）
 * - rollback（版本查找 + 事务）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ApplicationService } from './application.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

function createMockSnapshotService() {
  return {
    collectSnapshot: vi.fn().mockResolvedValue({ objects: [], pages: [], processes: [] }),
  };
}

function createMockCheckService() {
  return {
    check: vi.fn().mockResolvedValue({ status: 'PASS', issues: [] }),
  };
}

function createMockChangeLogService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    getChangeSet: vi.fn().mockResolvedValue({ changes: [] }),
  };
}

function createService() {
  const snapshotService = createMockSnapshotService();
  const checkService = createMockCheckService();
  const changeLogService = createMockChangeLogService();
  const service = new ApplicationService(
    snapshotService as unknown as ConstructorParameters<typeof ApplicationService>[0],
    checkService as unknown as ConstructorParameters<typeof ApplicationService>[1],
    changeLogService as unknown as ConstructorParameters<typeof ApplicationService>[2],
  );
  return { service, snapshotService, checkService, changeLogService };
}

function makeApp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'app-001',
    tenantId: 'tenant-001',
    apiName: 'test_app',
    name: 'Test App',
    description: 'A test app',
    icon: '📋',
    color: '#1677ff',
    status: 'DRAFT',
    version: 0,
    publishedSnapshot: null,
    publishedAt: null,
    createdById: 'user-001',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    _count: { objects: 3, pages: 5, processes: 2 },
    ...overrides,
  };
}

describe('ApplicationService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('返回租户下所有应用含资源统计', async () => {
      prisma.application.findMany.mockResolvedValue([makeApp()]);

      const { service } = createService();
      const result = await service.list('tenant-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('app-001');
      expect(result[0]!.stats.objects).toBe(3);
    });
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('返回应用详情含资源统计', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp());

      const { service } = createService();
      const result = await service.get('tenant-001', 'app-001');

      expect(result.id).toBe('app-001');
      expect(result.stats.objects).toBe(3);
    });

    it('应用不存在时抛出 NotFoundException', async () => {
      prisma.application.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.get('tenant-001', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('正常创建应用（DRAFT 状态 + version=0）', async () => {
      prisma.application.create.mockResolvedValue(makeApp());
      // create 内部调用 get() 返回详情
      prisma.application.findFirst.mockResolvedValue(makeApp());

      const { service, changeLogService } = createService();
      const result = await service.create('tenant-001', 'user-001', {
        name: 'Test App',
        apiName: 'test_app',
      });

      expect(result.id).toBe('app-001');
      const createCall = prisma.application.create.mock.calls[0]![0];
      expect(createCall.data.status).toBe('DRAFT');
      expect(createCall.data.version).toBe(0);
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'CREATE' }),
      );
    });

    it('未传 apiName 时自动生成', async () => {
      prisma.application.create.mockResolvedValue(makeApp({ apiName: 'auto_gen_name' }));
      prisma.application.findFirst.mockResolvedValue(makeApp({ apiName: 'auto_gen_name' }));

      const { service } = createService();
      await service.create('tenant-001', 'user-001', { name: 'Auto App' });

      const createCall = prisma.application.create.mock.calls[0]![0];
      expect(createCall.data.apiName).toBeTruthy();
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('正常更新应用', async () => {
      prisma.application.findFirst
        // update 内部的 findFirst (select name)
        .mockResolvedValueOnce({ name: 'Old Name' })
        // get() 内部的 findFirst
        .mockResolvedValueOnce(makeApp({ name: 'Updated App' }));
      prisma.application.updateMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      const result = await service.update('tenant-001', 'app-001', { name: 'Updated App' });

      expect(result.name).toBe('Updated App');
      expect(prisma.application.updateMany).toHaveBeenCalled();
    });

    it('应用不存在时抛出 NotFoundException', async () => {
      prisma.application.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.update('tenant-001', 'missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('DRAFT 状态应用可删除', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp({ status: 'DRAFT' }));
      prisma.application.deleteMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      await service.delete('tenant-001', 'app-001');

      expect(prisma.application.deleteMany).toHaveBeenCalledWith({
        where: { id: 'app-001', tenantId: 'tenant-001' },
      });
    });

    it('PUBLISHED 状态应用不可直接删除', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp({ status: 'PUBLISHED' }));

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001')).rejects.toThrow(BadRequestException);
    });

    it('ARCHIVED 状态有在途流程时不可删除', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp({ status: 'ARCHIVED' }));
      prisma.processInstance.count.mockResolvedValue(3);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001')).rejects.toThrow(BadRequestException);
    });

    it('ARCHIVED 状态无在途流程时可删除', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp({ status: 'ARCHIVED' }));
      prisma.processInstance.count.mockResolvedValue(0);
      prisma.application.deleteMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      await service.delete('tenant-001', 'app-001');

      expect(prisma.application.deleteMany).toHaveBeenCalled();
    });

    it('应用不存在时抛出 NotFoundException', async () => {
      prisma.application.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // archive
  // =========================================================================

  describe('archive', () => {
    it('PUBLISHED 状态应用可归档', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp({ status: 'PUBLISHED' }));
      prisma.application.update.mockResolvedValue(makeApp({ status: 'ARCHIVED' }));
      // get() 内部的 findFirst
      prisma.application.findFirst
        .mockResolvedValueOnce({ id: 'app-001', name: 'Test', status: 'PUBLISHED' })
        .mockResolvedValueOnce(makeApp({ status: 'ARCHIVED' }));

      const { service } = createService();
      const result = await service.archive('tenant-001', 'app-001', 'user-001');

      expect(result.status).toBe('ARCHIVED');
    });

    it('DEVELOPMENT 状态应用不可归档', async () => {
      prisma.application.findFirst.mockResolvedValue(makeApp({ status: 'DEVELOPMENT' }));

      const { service } = createService();
      await expect(service.archive('tenant-001', 'app-001', 'user-001')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // publish
  // =========================================================================

  describe('publish', () => {
    it('正常发布 — 预检通过 + 快照收集 + 事务写入', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null); // 版本号不重复
      prisma.appVersion.create.mockResolvedValue({
        id: 'ver-001',
        appId: 'app-001',
        versionNumber: '1.0.0',
        description: 'Initial',
        snapshot: {},
        changeSet: {},
        status: 'PUBLISHED',
        publishedBy: 'user-001',
        publishedAt: new Date('2026-08-22'),
      });

      const { service, snapshotService, checkService } = createService();
      const result = await service.publish('tenant-001', 'app-001', 'user-001', {
        version: '1.0.0',
        description: 'Initial release',
      });

      expect(checkService.check).toHaveBeenCalledWith('tenant-001', 'app-001', 'user-001');
      expect(snapshotService.collectSnapshot).toHaveBeenCalledWith(
        'tenant-001',
        'app-001',
        '1.0.0',
        'user-001',
      );
      expect(result.versionNumber).toBe('1.0.0');
    });

    it('版本号格式不正确时抛出 BadRequestException', async () => {
      const { service } = createService();
      await expect(
        service.publish('tenant-001', 'app-001', 'user-001', {
          version: 'invalid',
          description: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('版本号已存在时抛出 BadRequestException', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({ id: 'ver-old' });

      const { service } = createService();
      await expect(
        service.publish('tenant-001', 'app-001', 'user-001', {
          version: '1.0.0',
          description: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('预检未通过时抛出 BadRequestException', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null);
      const { service, checkService } = createService();
      checkService.check.mockResolvedValue({
        status: 'FAIL',
        issues: [{ level: 'ERROR', message: 'Missing page binding' }],
      });

      await expect(
        service.publish('tenant-001', 'app-001', 'user-001', {
          version: '1.0.0',
          description: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // rollback
  // =========================================================================

  describe('rollback', () => {
    it('目标版本不存在时抛出 NotFoundException', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.rollback('tenant-001', 'app-001', 'missing-ver', 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
