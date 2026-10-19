/**
 * AppMemberService 单元测试 — 成员管理（ADR-0005 决策 2/5/6）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppMemberService } from './app-member.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

function makeMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    appId: 'app-001',
    userId: 'user-owner',
    role: 'OWNER',
    addedBy: null,
    createdAt: new Date('2026-10-19'),
    user: { name: '所有者', email: 'owner@x.dev' },
    ...overrides,
  };
}

describe('AppMemberService', () => {
  const prisma = getMockPrisma();
  const appAccess = {
    assertOwnerAccess: vi.fn().mockResolvedValue('owner' as const),
  };
  const service = new AppMemberService(
    appAccess as unknown as ConstructorParameters<typeof AppMemberService>[0],
  );

  beforeEach(() => {
    vi.clearAllMocks();
    appAccess.assertOwnerAccess.mockResolvedValue('owner');
  });

  describe('listMembers', () => {
    it('返回成员清单（含姓名邮箱），OWNER 在前', async () => {
      prisma.applicationMember.findMany.mockResolvedValue([
        makeMemberRow(),
        makeMemberRow({ id: 'm-2', userId: 'user-b', role: 'MEMBER', addedBy: 'user-owner' }),
      ]);

      const result = await service.listMembers('tenant-001', 'app-001');

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ userId: 'user-owner', role: 'owner' });
      expect(result.items[0]!.name).toBeTruthy();
      expect(prisma.applicationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-001', appId: 'app-001' },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });
  });

  describe('candidates（候选集 = 租户级 BUILDER 且未入会）', () => {
    it('查 BUILDER 角色、ACTIVE、未加入本应用的用户', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'user-b', name: '同事', email: 'b@x.dev' }]);

      const result = await service.candidates('tenant-001', 'app-001');

      expect(result.items).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-001',
            status: 'ACTIVE',
            userRoles: { some: { role: { code: 'BUILDER' } } },
            appMemberships: { none: { appId: 'app-001' } },
          }),
        }),
      );
    });
  });

  describe('addMember', () => {
    it('目标用户不存在 → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.addMember('tenant-001', 'app-001', 'ghost', 'owner-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('目标用户无搭建器访问权（END_USER-only）→ 400，防"加了却进不来"', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-eu',
        userRoles: [{ role: { code: 'END_USER' } }],
      });
      await expect(
        service.addMember('tenant-001', 'app-001', 'user-eu', 'owner-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.applicationMember.create).not.toHaveBeenCalled();
    });

    it('目标已是应用所有者 → 400 且不写库（防 OWNER 被降级成无主应用，OCR HIGH 修复回归）', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-owner',
        name: '所有者',
        userRoles: [{ role: { code: 'BUILDER' } }],
      });
      prisma.applicationMember.findUnique.mockResolvedValue(makeMemberRow({ role: 'OWNER' }));

      await expect(
        service.addMember('tenant-001', 'app-001', 'user-owner', 'owner-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.applicationMember.create).not.toHaveBeenCalled();
      expect(prisma.applicationMember.updateMany).not.toHaveBeenCalled();
    });

    it('已是协作者重复添加：幂等返回，不重复审计', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-b',
        name: '同事',
        userRoles: [{ role: { code: 'BUILDER' } }],
      });
      prisma.applicationMember.findUnique.mockResolvedValue(
        makeMemberRow({ userId: 'user-b', role: 'MEMBER' }),
      );

      const result = await service.addMember('tenant-001', 'app-001', 'user-b', 'owner-1');

      expect(result).toEqual({ userId: 'user-b', role: 'member' });
      expect(prisma.applicationMember.create).not.toHaveBeenCalled();
    });

    it('正常添加：写 MEMBER 行 + 审计', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-b',
        name: '同事',
        userRoles: [{ role: { code: 'BUILDER' } }],
      });
      prisma.applicationMember.findUnique.mockResolvedValue(null);

      const result = await service.addMember('tenant-001', 'app-001', 'user-b', 'owner-1');

      expect(result).toMatchObject({ userId: 'user-b', role: 'member' });
      expect(prisma.applicationMember.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-001',
          appId: 'app-001',
          userId: 'user-b',
          role: 'MEMBER',
          addedBy: 'owner-1',
        }),
      });
    });
  });

  describe('removeMember', () => {
    it('移除 OWNER → 400（须先转移所有权）', async () => {
      prisma.applicationMember.findUnique.mockResolvedValue(makeMemberRow({ role: 'OWNER' }));
      await expect(
        service.removeMember('tenant-001', 'app-001', 'user-owner', 'owner-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.applicationMember.delete).not.toHaveBeenCalled();
    });

    it('移除不存在 → 404', async () => {
      prisma.applicationMember.findUnique.mockResolvedValue(null);
      await expect(
        service.removeMember('tenant-001', 'app-001', 'ghost', 'owner-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('正常移除 MEMBER + 审计', async () => {
      prisma.applicationMember.findUnique.mockResolvedValue(
        makeMemberRow({ userId: 'user-b', role: 'MEMBER' }),
      );
      await service.removeMember('tenant-001', 'app-001', 'user-b', 'owner-1');
      expect(prisma.applicationMember.delete).toHaveBeenCalledWith({
        where: { id: 'm-1' },
      });
    });
  });

  describe('transferOwnership（原 OWNER 降 MEMBER，新 OWNER 提升，同事务）', () => {
    it('目标用户无搭建器访问权 → 400 且不写库', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-eu',
        userRoles: [{ role: { code: 'END_USER' } }],
      });
      await expect(
        service.transferOwnership('tenant-001', 'app-001', 'user-eu', 'owner-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('转移即两条成员行原子更新：先降旧 OWNER 再提升新 OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-b',
        name: '同事',
        userRoles: [{ role: { code: 'BUILDER' } }],
      });
      prisma.applicationMember.findFirst.mockResolvedValue(makeMemberRow({ userId: 'user-owner' }));

      await service.transferOwnership('tenant-001', 'app-001', 'user-b', 'owner-1');

      const txOps = prisma.$transaction.mock.calls[0]?.[0] as unknown[];
      expect(Array.isArray(txOps)).toBe(true);
      // 第一条：旧 OWNER 降为 MEMBER；第二条：新 OWNER 行 upsert
      expect(txOps).toHaveLength(2);
    });
  });
});
