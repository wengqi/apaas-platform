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
  const permissionService = { getUserRoleIds: vi.fn().mockResolvedValue([]) };
  const service = new AppAccessService(
    permissionService as unknown as ConstructorParameters<typeof AppAccessService>[0],
  );

  beforeEach(() => {
    vi.clearAllMocks();
    permissionService.getUserRoleIds.mockResolvedValue([]);
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

  // ===========================================================================
  // 运行面可见性 + 数据面双门（对抗审查 security-01/R1、devil-01/R1，P0-9/P0-10）
  // ===========================================================================

  describe('isRuntimeVisible（运行面可见性：角色权限归纳 + 已发布）', () => {
    it('零角色用户（默认拒绝）→ false，不查应用表', async () => {
      permissionService.getUserRoleIds.mockResolvedValue([]);
      expect(await service.isRuntimeVisible('tenant-001', makeUser(), 'app-001')).toBe(false);
      expect(prisma.application.findFirst).not.toHaveBeenCalled();
    });

    it('租户级通配 ALLOW 规则（appId=null）→ 已发布应用可见', async () => {
      permissionService.getUserRoleIds.mockResolvedValue(['role-1']);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: null }]);
      prisma.application.findFirst.mockResolvedValue({ id: 'app-001' });
      expect(await service.isRuntimeVisible('tenant-001', makeUser(), 'app-001')).toBe(true);
    });

    it('应用级 ALLOW 规则命中 → 可见；未命中 → false', async () => {
      permissionService.getUserRoleIds.mockResolvedValue(['role-1']);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: 'app-other' }]);
      expect(await service.isRuntimeVisible('tenant-001', makeUser(), 'app-001')).toBe(false);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: 'app-001' }]);
      prisma.application.findFirst.mockResolvedValue({ id: 'app-001' });
      expect(await service.isRuntimeVisible('tenant-001', makeUser(), 'app-001')).toBe(true);
    });

    it('规则命中但应用未发布（DRAFT）→ false', async () => {
      permissionService.getUserRoleIds.mockResolvedValue(['role-1']);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: 'app-001' }]);
      prisma.application.findFirst.mockResolvedValue(null);
      expect(await service.isRuntimeVisible('tenant-001', makeUser(), 'app-001')).toBe(false);
    });

    it('超管短路角色归纳，但仍要求应用已发布', async () => {
      prisma.application.findFirst.mockResolvedValue(null);
      expect(
        await service.isRuntimeVisible('tenant-001', makeUser({ isSuperAdmin: true }), 'app-001'),
      ).toBe(false);
      expect(permissionService.getUserRoleIds).not.toHaveBeenCalled();
    });
  });

  describe('assertDataAccess（数据面双门：设计面 OR 运行面可见）', () => {
    it('设计面成员（MEMBER）→ 放行（不查权限规则）——保 studio 对 DRAFT 应用预览', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
      await expect(
        service.assertDataAccess('tenant-001', makeUser(), 'app-001'),
      ).resolves.toBeUndefined();
      expect(prisma.permissionRule.findMany).not.toHaveBeenCalled();
    });

    it('非设计面 + 运行面可见（已发布+规则命中）→ 放行——保 END_USER 消费已发布应用', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue(null);
      permissionService.getUserRoleIds.mockResolvedValue(['role-1']);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: null }]);
      prisma.application.findFirst.mockResolvedValue({ id: 'app-001' });
      await expect(
        service.assertDataAccess('tenant-001', makeUser(), 'app-001'),
      ).resolves.toBeUndefined();
    });

    it('非设计面 + DRAFT 应用 → 404「应用不存在」（对齐 ADR-0005 决策 12 blanket 404）', async () => {
      prisma.applicationMember.findFirst.mockResolvedValue(null);
      permissionService.getUserRoleIds.mockResolvedValue(['role-1']);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: null }]);
      prisma.application.findFirst.mockResolvedValue(null);
      await expect(service.assertDataAccess('tenant-001', makeUser(), 'app-001')).rejects.toThrow(
        '应用不存在',
      );
    });
  });

  describe('assertRuntimeVisible（运行面页面读可见闸，P0-10）', () => {
    it('不可见/未发布 → 404「应用不存在」', async () => {
      permissionService.getUserRoleIds.mockResolvedValue([]);
      await expect(
        service.assertRuntimeVisible('tenant-001', makeUser(), 'app-001'),
      ).rejects.toThrow('应用不存在');
    });

    it('已发布 + 规则命中 → 通过', async () => {
      permissionService.getUserRoleIds.mockResolvedValue(['role-1']);
      prisma.permissionRule.findMany.mockResolvedValue([{ appId: null }]);
      prisma.application.findFirst.mockResolvedValue({ id: 'app-001' });
      await expect(
        service.assertRuntimeVisible('tenant-001', makeUser(), 'app-001'),
      ).resolves.toBeUndefined();
    });
  });
});
