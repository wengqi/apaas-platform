/**
 * TenantService 单元测试 — 租户管理。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const now = new Date('2026-08-23T10:00:00Z');

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-001',
    name: '测试租户',
    slug: 'test-tenant',
    description: '测试用途',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    _count: { users: 5, applications: 2, roles: 3, orgNodes: 1 },
    ...overrides,
  };
}

describe('TenantService', () => {
  const prisma = getMockPrisma();
  let service: TenantService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantService();
  });

  describe('list', () => {
    it('应返回租户列表', async () => {
      prisma.tenant.findMany.mockResolvedValue([
        makeTenant({ id: 'tenant-001', name: '租户A' }),
        makeTenant({ id: 'tenant-002', name: '租户B' }),
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('应返回租户详情', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());

      const result = await service.get('tenant-001');

      expect(result.id).toBe('tenant-001');
    });

    it('租户不存在应抛出 NotFoundException', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.get('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('应更新租户信息', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant());
      prisma.tenant.update.mockResolvedValue(makeTenant({ name: '更新后的租户' }));

      await service.update('tenant-001', { name: '更新后的租户' });

      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '更新后的租户' }),
        }),
      );
    });
  });

  describe('suspend', () => {
    it('应暂停租户', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ status: 'ACTIVE' }));
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'SUSPENDED' }));

      await service.suspend('tenant-001');

      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUSPENDED' }),
        }),
      );
    });
  });

  describe('activate', () => {
    it('应激活租户', async () => {
      prisma.tenant.findUnique.mockResolvedValue(makeTenant({ status: 'SUSPENDED' }));
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'ACTIVE' }));

      await service.activate('tenant-001');

      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });
});
