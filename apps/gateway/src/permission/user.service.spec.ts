/**
 * UserService 单元测试 — 用户管理。
 *
 * P1-26（对抗审查 R2-engineering-06）：删除用户前必须阻断名下 OWNER 应用——
 * application_members.OWNER 行随用户级联删除会产生无主应用（ADR-0005 归属不变量），
 * 从非管理员视角应用消失且零告警。裁决：删除前置守卫阻断（要求先转移所有权）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

describe('UserService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delete', () => {
    it('用户不存在 → 404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const svc = new UserService();

      await expect(svc.delete('tenant-001', 'user-404')).rejects.toThrow(NotFoundException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('P1-26：名下有 OWNER 应用 → 400 阻断，不执行删除', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-001', tenantId: 'tenant-001' });
      prisma.applicationMember.count.mockResolvedValue(2);

      const svc = new UserService();
      await expect(svc.delete('tenant-001', 'user-001')).rejects.toThrow(BadRequestException);

      expect(prisma.user.delete).not.toHaveBeenCalled();
      // 守卫必须按「角色 OWNER」精确统计（member 协作者不阻断）
      const arg = prisma.applicationMember.count.mock.calls[0]![0] as {
        where: Record<string, unknown>;
      };
      expect(arg.where).toEqual({ tenantId: 'tenant-001', userId: 'user-001', role: 'OWNER' });
    });

    it('名下无 OWNER 应用（仅 MEMBER 协作）→ 正常删除', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-001', tenantId: 'tenant-001' });
      prisma.applicationMember.count.mockResolvedValue(0);
      prisma.user.delete.mockResolvedValue({ id: 'user-001' });

      const svc = new UserService();
      await expect(svc.delete('tenant-001', 'user-001')).resolves.toBeUndefined();
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-001' } });
    });
  });
});
