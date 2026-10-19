/**
 * AppAccessService 单元测试 — 应用归属解析（ADR-0005 设计面成员闸的唯一判定源）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AppAccessService } from './app-access.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'builder@apaas.dev',
    roleIds: ['role-builder'],
    roleCodes: ['BUILDER'],
    isPlatformAdmin: false,
    isSuperAdmin: false,
    ...overrides,
  };
}

describe('AppAccessService', () => {
  const prisma = getMockPrisma();
  const service = new AppAccessService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveDesignRole', () => {
    it('管理员（isSuperAdmin = 平台超管 ∪ TENANT_ADMIN）短路为 admin，不查成员表', async () => {
      const role = await service.resolveDesignRole(
        makeUser({ isSuperAdmin: true }),
        'tenant-001',
        'app-001',
      );
      expect(role).toBe('admin');
      expect(prisma.applicationMember.findFirst).not.toHaveBeenCalled();
    });

    it('OWNER 成员行 → owner', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue({ role: 'OWNER' });
      const role = await service.resolveDesignRole(makeUser(), 'tenant-001', 'app-001');
      expect(role).toBe('owner');
      expect(prisma.applicationMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-001', appId: 'app-001', userId: 'user-001' },
        }),
      );
    });

    it('MEMBER 成员行 → member', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
      expect(await service.resolveDesignRole(makeUser(), 'tenant-001', 'app-001')).toBe('member');
    });

    it('无成员行 → null（不抛，供守卫与列表过滤各自决定语义）', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue(null);
      expect(await service.resolveDesignRole(makeUser(), 'tenant-001', 'app-001')).toBeNull();
    });
  });

  describe('assertDesignAccess', () => {
    it('非成员 → 403，错误信息不透露所有者', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue(null);
      await expect(service.assertDesignAccess(makeUser(), 'tenant-001', 'app-001')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('member 放行并返回角色', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
      expect(await service.assertDesignAccess(makeUser(), 'tenant-001', 'app-001')).toBe('member');
    });
  });

  describe('assertOwnerAccess（删除/归档/转移/成员管理）', () => {
    it('member → 403', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
      await expect(service.assertOwnerAccess(makeUser(), 'tenant-001', 'app-001')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('owner 放行', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue({ role: 'OWNER' });
      expect(await service.assertOwnerAccess(makeUser(), 'tenant-001', 'app-001')).toBe('owner');
    });

    it('admin 放行（恒等同 OWNER）', async () => {
      expect(
        await service.assertOwnerAccess(makeUser({ isSuperAdmin: true }), 'tenant-001', 'app-001'),
      ).toBe('admin');
    });
  });

  describe('visibleAppIds（设计面列表可见集）', () => {
    it('admin → all', async () => {
      expect(await service.visibleAppIds(makeUser({ isSuperAdmin: true }), 'tenant-001')).toBe(
        'all',
      );
      expect(prisma.applicationMember.findMany).not.toHaveBeenCalled();
    });

    it('普通搭建者 → 成员行 appId 集合（owner ∪ member）', async () => {
      prisma.applicationMember.findMany.mockResolvedValue([
        { appId: 'app-own' },
        { appId: 'app-collab' },
      ]);
      expect(await service.visibleAppIds(makeUser(), 'tenant-001')).toEqual([
        'app-own',
        'app-collab',
      ]);
      expect(prisma.applicationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-001', userId: 'user-001' } }),
      );
    });

    it('无任何成员行 → 空数组（默认不可见）', async () => {
      prisma.applicationMember.findMany.mockResolvedValue([]);
      expect(await service.visibleAppIds(makeUser(), 'tenant-001')).toEqual([]);
    });
  });

  describe('membershipRoles（列表卡片 myRole）', () => {
    it('admin 不查成员表，返回空 Map', async () => {
      const roles = await service.membershipRoles(makeUser({ isSuperAdmin: true }), 'tenant-001');
      expect(roles.size).toBe(0);
      expect(prisma.applicationMember.findMany).not.toHaveBeenCalled();
    });

    it('成员行映射为 appId → owner|member', async () => {
      prisma.applicationMember.findMany.mockResolvedValue([
        { appId: 'app-own', role: 'OWNER' },
        { appId: 'app-collab', role: 'MEMBER' },
      ]);
      const roles = await service.membershipRoles(makeUser(), 'tenant-001');
      expect(roles.get('app-own')).toBe('owner');
      expect(roles.get('app-collab')).toBe('member');
    });
  });

  describe('grantOwner（创建应用时写 OWNER 行）', () => {
    it('写入 role=OWNER 的成员行', async () => {
      await service.grantOwner('tenant-001', 'app-001', 'user-001');
      expect(prisma.applicationMember.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-001',
          appId: 'app-001',
          userId: 'user-001',
          role: 'OWNER',
          addedBy: null,
        },
      });
    });
  });
});
