/**
 * PageService 单元测试 — 页面 Schema CRUD。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PageService } from './page.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const now = new Date('2026-08-23T10:00:00Z');

function makePageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    apiName: 'test-page',
    name: '测试页',
    type: 'custom',
    objectId: null,
    schema: {
      version: '1',
      pageType: 'custom',
      viewModel: { variables: {} },
      root: { id: 'r', type: 'page', props: {} },
    },
    isPublished: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockChangeLogService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  };
}

function createService() {
  const changeLogService = createMockChangeLogService();
  const service = new PageService(
    changeLogService as unknown as ConstructorParameters<typeof PageService>[0],
  );
  return { service, changeLogService };
}

describe('PageService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('应返回应用下的页面列表', async () => {
      prisma.pageMeta.findMany.mockResolvedValue([makePageRow()]);

      const { service } = createService();
      const result = await service.list('tenant-001', 'app-001');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('测试页');
    });
  });

  describe('get', () => {
    it('应返回页面详情', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());

      const { service } = createService();
      const result = await service.get('tenant-001', 'page-001');

      expect(result.id).toBe('page-001');
    });

    it('页面不存在应抛出 NotFoundException', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.get('tenant-001', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('应创建页面（dashboard 类型自动生成模板）', async () => {
      prisma.pageMeta.create.mockResolvedValue(makePageRow({ type: 'dashboard' }));
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow({ type: 'dashboard' }));

      const { service } = createService();
      const result = await service.create('tenant-001', 'app-001', {
        apiName: 'dashboard-page',
        name: '仪表盘',
        type: 'dashboard' as never,
      });

      expect(result.id).toBe('page-001');
      expect(prisma.pageMeta.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-001',
            appId: 'app-001',
            type: 'dashboard',
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('应删除页面', async () => {
      prisma.pageMeta.deleteMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      await service.delete('tenant-001', 'page-001');

      expect(prisma.pageMeta.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'page-001', tenantId: 'tenant-001' }),
        }),
      );
    });
  });
});
