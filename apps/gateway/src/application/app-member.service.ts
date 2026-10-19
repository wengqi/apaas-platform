import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { writeAudit } from '../common/audit.js';
import { AppAccessService } from '../app-access/app-access.service.js';

/**
 * 应用成员管理服务（ADR-0005）— 成员清单 / 候选集 / 增删 / 所有权转移。
 * 所有写操作为所有者级（admin | owner，由控制器经 AppAccessService.assertOwnerAccess 断言）。
 */
@Injectable()
export class AppMemberService {
  private readonly logger = new Logger(AppMemberService.name);

  constructor(private readonly appAccess: AppAccessService) {}

  /** 成员清单（含姓名邮箱），OWNER 在前。 */
  async listMembers(
    tenantId: string,
    appId: string,
  ): Promise<{
    items: Array<{
      userId: string;
      name: string | null;
      email: string;
      role: 'owner' | 'member';
      addedBy: string | null;
      createdAt: string;
    }>;
  }> {
    const rows = await prisma.applicationMember.findMany({
      where: { tenantId, appId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { name: true, email: true } } },
    });
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        role: r.role === 'OWNER' ? 'owner' : 'member',
        addedBy: r.addedBy,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * 成员候选集 = 租户级 BUILDER 角色的 ACTIVE 用户且未加入本应用（ADR-0005 决策 5）。
   * TENANT_ADMIN 恒全量无需成员行，不进候选；END_USER-only 加了也会被 studio 闸拦，不进候选。
   */
  async candidates(
    tenantId: string,
    appId: string,
  ): Promise<{
    items: Array<{ userId: string; name: string; email: string }>;
  }> {
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        userRoles: { some: { role: { code: 'BUILDER' } } },
        appMemberships: { none: { appId } },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return { items: users.map((u) => ({ userId: u.id, name: u.name, email: u.email })) };
  }

  /** 添加协作者（MEMBER）。目标须具备搭建器访问权，防"加了却进不来"。 */
  async addMember(tenantId: string, appId: string, targetUserId: string, addedBy: string) {
    const target = await this.requireStudioUser(targetUserId);
    await prisma.applicationMember.upsert({
      where: { appId_userId: { appId, userId: targetUserId } },
      update: { role: 'MEMBER' },
      create: {
        tenantId,
        appId,
        userId: targetUserId,
        role: 'MEMBER',
        addedBy,
      },
    });
    writeAudit({
      tenantId,
      userId: addedBy,
      action: 'APP_MEMBER_ADD',
      resource: 'APPLICATION',
      resourceId: appId,
      appId,
      detail: { targetUserId, targetName: target.name },
    });
    return { userId: targetUserId, role: 'member' as const };
  }

  /** 移除协作者。OWNER 不可直接移除（须先转移所有权，保证每应用恒有 OWNER）。 */
  async removeMember(tenantId: string, appId: string, targetUserId: string, removedBy: string) {
    const row = await prisma.applicationMember.findUnique({
      where: { appId_userId: { appId, userId: targetUserId } },
    });
    if (!row) throw new NotFoundException('该用户不是本应用成员');
    if (row.role === 'OWNER') {
      throw new BadRequestException('应用所有者不可移除，请先转移所有权');
    }
    await prisma.applicationMember.delete({ where: { id: row.id } });
    writeAudit({
      tenantId,
      userId: removedBy,
      action: 'APP_MEMBER_REMOVE',
      resource: 'APPLICATION',
      resourceId: appId,
      appId,
      detail: { targetUserId },
    });
  }

  /**
   * 转移所有权（ADR-0005 决策 5）：原 OWNER 自动降为 MEMBER（不丢工作），新 OWNER 提升；
   * 同事务两条成员行原子更新（partial unique 保证全程至多一个 OWNER）。
   * 目标须具备搭建器访问权；owner 离职由 admin 手工转移，无自动继承。
   */
  async transferOwnership(
    tenantId: string,
    appId: string,
    newOwnerUserId: string,
    operatorId: string,
  ) {
    await this.requireStudioUser(newOwnerUserId);
    const oldOwner = await prisma.applicationMember.findFirst({
      where: { tenantId, appId, role: 'OWNER' },
      select: { userId: true },
    });
    if (oldOwner?.userId === newOwnerUserId) {
      throw new BadRequestException('该用户已是应用所有者');
    }
    await prisma.$transaction([
      ...(oldOwner
        ? [
            prisma.applicationMember.updateMany({
              where: { tenantId, appId, role: 'OWNER' },
              data: { role: 'MEMBER' },
            }),
          ]
        : []),
      prisma.applicationMember.upsert({
        where: { appId_userId: { appId, userId: newOwnerUserId } },
        update: { role: 'OWNER' },
        create: { tenantId, appId, userId: newOwnerUserId, role: 'OWNER', addedBy: operatorId },
      }),
    ]);
    writeAudit({
      tenantId,
      userId: operatorId,
      action: 'APP_OWNER_TRANSFER',
      resource: 'APPLICATION',
      resourceId: appId,
      appId,
      detail: { from: oldOwner?.userId ?? null, to: newOwnerUserId },
    });
    this.logger.log(`所有权转移: app=${appId} → user=${newOwnerUserId} by ${operatorId}`);
  }

  /** 断言目标用户存在且具备搭建器访问权（TENANT_ADMIN/BUILDER/平台超管）。 */
  private async requireStudioUser(userId: string) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        isPlatformAdmin: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!target) throw new NotFoundException('目标用户不存在');
    const roleCodes = target.userRoles.map((ur) => ur.role.code);
    const hasStudioAccess =
      target.isPlatformAdmin || roleCodes.includes('TENANT_ADMIN') || roleCodes.includes('BUILDER');
    if (!hasStudioAccess) {
      throw new BadRequestException(
        '目标用户需具备搭建器访问权限（BUILDER 或管理员）才能成为应用成员',
      );
    }
    return target;
  }
}
