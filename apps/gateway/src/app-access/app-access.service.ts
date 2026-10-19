import { Injectable, ForbiddenException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

/**
 * 用户对某应用的设计面访问角色（ADR-0005）：
 * - admin：平台超管 ∪ TENANT_ADMIN（isSuperAdmin，与 jwt.strategy / PermissionService 同源），恒等同 OWNER，不需成员行；
 * - owner / member：application_members 成员行。
 */
export type AppAccessRole = 'admin' | 'owner' | 'member';

/** 设计面非成员统一拒绝文案——不透露所有者身份（ADR-0005 决策 12）。 */
export const DESIGN_ACCESS_DENIED_MESSAGE = '无权访问该应用（需所有者添加为协作者或联系管理员）';
export const OWNER_ACCESS_DENIED_MESSAGE = '该操作仅应用所有者或管理员可执行';

/**
 * 应用归属判定服务 — 设计面成员闸与 MCP 的唯一判定源（ADR-0005）。
 * HTTP 走 DesignAccessGuard，MCP 不经控制器须在 McpService 内显式调用本服务，两入口同一断言。
 * 运行面不消费本服务：业务用户能用哪些应用由角色权限决定（ApplicationService.listVisibleForUser）。
 */
@Injectable()
export class AppAccessService {
  /** 解析设计面访问角色；非成员返回 null（不抛），由调用方决定 403 / 过滤语义。 */
  async resolveDesignRole(
    user: AuthenticatedUser,
    tenantId: string,
    appId: string,
  ): Promise<AppAccessRole | null> {
    if (user.isSuperAdmin) return 'admin';
    const row = await prisma.applicationMember.findFirst({
      where: { tenantId, appId, userId: user.id },
      select: { role: true },
    });
    if (!row) return null;
    return row.role === 'OWNER' ? 'owner' : 'member';
  }

  /** 断言设计面访问（admin / owner / member），否则 403。 */
  async assertDesignAccess(
    user: AuthenticatedUser,
    tenantId: string,
    appId: string,
  ): Promise<AppAccessRole> {
    const role = await this.resolveDesignRole(user, tenantId, appId);
    if (!role) throw new ForbiddenException(DESIGN_ACCESS_DENIED_MESSAGE);
    return role;
  }

  /** 断言所有者级操作（删除 / 归档 / 转移所有权 / 成员管理）：admin / owner，否则 403。 */
  async assertOwnerAccess(
    user: AuthenticatedUser,
    tenantId: string,
    appId: string,
  ): Promise<AppAccessRole> {
    const role = await this.assertDesignAccess(user, tenantId, appId);
    if (role === 'member') throw new ForbiddenException(OWNER_ACCESS_DENIED_MESSAGE);
    return role;
  }

  /** 设计面可见应用集：admin → 'all'；否则成员行（owner ∪ member）的 appId 集合。 */
  async visibleAppIds(user: AuthenticatedUser, tenantId: string): Promise<'all' | string[]> {
    if (user.isSuperAdmin) return 'all';
    const rows = await prisma.applicationMember.findMany({
      where: { tenantId, userId: user.id },
      select: { appId: true },
    });
    return rows.map((r) => r.appId);
  }

  /** 当前用户在各应用的成员角色（appId → owner|member）；admin 不查（恒 admin，由调用方处理）。 */
  async membershipRoles(
    user: AuthenticatedUser,
    tenantId: string,
  ): Promise<Map<string, 'owner' | 'member'>> {
    if (user.isSuperAdmin) return new Map();
    const rows = await prisma.applicationMember.findMany({
      where: { tenantId, userId: user.id },
      select: { appId: true, role: true },
    });
    return new Map(rows.map((r) => [r.appId, r.role === 'OWNER' ? 'owner' : 'member']));
  }

  /** 创建应用时写 OWNER 行（MCP create_application 同路径）。 */
  async grantOwner(tenantId: string, appId: string, userId: string): Promise<void> {
    await prisma.applicationMember.create({
      data: { tenantId, appId, userId, role: 'OWNER', addedBy: null },
    });
  }
}
