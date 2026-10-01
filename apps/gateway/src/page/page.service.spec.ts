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
    {
      resolve: vi.fn().mockResolvedValue({
        environmentId: '',
        versionId: null,
        bundleMode: false,
        bundle: null,
      }),
    } as unknown as ConstructorParameters<typeof PageService>[1],
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
      expect(result[0]?.name).toBe('测试页');
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

  describe('保存点（E2-4 飞书式历史）', () => {
    it('update 携带 schema 时自动捕获保存点', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());
      prisma.pageMeta.updateMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      await service.update('tenant-001', 'page-001', { schema: makePageRow().schema as never });

      expect(prisma.pageSavePoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-001',
            pageId: 'page-001',
            source: 'save',
          }),
        }),
      );
    });

    it('update 不带 schema（改名/发布）不捕获保存点', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());
      prisma.pageMeta.updateMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      await service.update('tenant-001', 'page-001', { name: '改名' });

      expect(prisma.pageSavePoint.create).not.toHaveBeenCalled();
    });

    it('listSavePoints 返回映射后的保存点信息（不含 schema）', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());
      prisma.pageSavePoint.findMany.mockResolvedValue([
        {
          id: 'sp-1',
          pageId: 'page-001',
          source: 'save',
          createdBy: 'user-1',
          createdAt: now,
        },
      ]);

      const { service } = createService();
      const points = await service.listSavePoints('tenant-001', 'page-001');

      expect(points).toHaveLength(1);
      expect(points[0]).toMatchObject({
        id: 'sp-1',
        pageId: 'page-001',
        source: 'save',
        createdBy: 'user-1',
      });
      expect('schema' in (points[0] ?? {})).toBe(false);
    });

    it('listSavePoints 页面不存在时抛 404', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.listSavePoints('tenant-001', 'page-404')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('restoreSavePoint 写回 schema 并追加 restore 回滚点', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());
      prisma.pageSavePoint.findFirst.mockResolvedValue({
        id: 'sp-1',
        tenantId: 'tenant-001',
        pageId: 'page-001',
        schema: makePageRow().schema,
        source: 'save',
        createdBy: 'user-1',
        createdAt: now,
      });

      const { service } = createService();
      await service.restoreSavePoint('tenant-001', 'page-001', 'sp-1', 'user-2');

      // mock 环境下事务数组元素为 undefined，仅验证事务执行 + 回滚点写入
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.pageMeta.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'page-001', tenantId: 'tenant-001' },
        }),
      );
      expect(prisma.pageSavePoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'restore', createdBy: 'user-2' }),
        }),
      );
    });

    it('restoreSavePoint 保存点不存在时抛 404 且不写库', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());
      prisma.pageSavePoint.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.restoreSavePoint('tenant-001', 'page-001', 'sp-404')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('保存点超过上限时裁剪最旧的', async () => {
      prisma.pageMeta.findFirst.mockResolvedValue(makePageRow());
      prisma.pageMeta.updateMany.mockResolvedValue({ count: 1 });
      // 51 条现存保存点 → 应删除 1 条（最旧的 id 在末尾）
      // 最新在前（createdAt desc）：rows[50] 即最旧的一条
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `sp-${String(i).padStart(2, '0')}`,
      })).reverse();
      prisma.pageSavePoint.findMany.mockResolvedValue(rows);

      const { service } = createService();
      await service.update('tenant-001', 'page-001', { schema: makePageRow().schema as never });

      expect(prisma.pageSavePoint.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['sp-00'] }, tenantId: 'tenant-001' },
      });
    });
  });
});
