import { Injectable, ForbiddenException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

/**
 * 权限引擎 — RBAC + ABAC 混合模型。
 *
 * 核心流程：
 *  1. 超级管理员短路 → 直接通过
 *  2. 查询用户的所有角色（直接角色 + 组织授权角色）
 *  3. 查询匹配的 PermissionRule（按 type + action + targetId）
 *  4. Deny-overrides：有 DENY 规则 → 拒绝
 *  5. 有 ALLOW 规则 → 通过，附带 condition/fieldScope 供行级过滤
 *  6. 无匹配规则 → 拒绝（默认拒绝策略）
 */
@Injectable()
export class PermissionService {
  /**
   * 获取用户的所有角色 ID（直接角色 + 组织授权角色）。
   */
  async getUserRoleIds(userId: string, tenantId: string): Promise<string[]> {
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({
        where: { userId },
        select: { roleId: true },
      }),
      prisma.orgMember.findMany({
        where: { userId },
        select: { orgId: true },
      }),
    ]);

    let roleIds = userRoles.map((ur) => ur.roleId);

    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) } },
        select: { roleId: true },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
    }

    return roleIds;
  }

  /**
   * 获取用户的组织节点 ID 集合。
   */
  async getUserOrgIds(userId: string): Promise<string[]> {
    const orgMembers = await prisma.orgMember.findMany({
      where: { userId },
      select: { orgId: true },
    });
    return orgMembers.map((m) => m.orgId);
  }

  /**
   * 权限检查 — 校验用户是否有权限执行某操作。
   *
   * @returns 允许时返回 { allowed: true, condition?, fieldScope? }
   * @throws ForbiddenException 当拒绝时
   */
  async check(
    user: AuthenticatedUser,
    type: string,
    action: string,
    targetId: string,
    targetNodeId?: string,
  ): Promise<{ allowed: boolean; condition?: unknown; fieldScope?: string[] | null }> {
    // 超级管理员短路
    if (user.isSuperAdmin) {
      return { allowed: true };
    }

    const roleIds = await this.getUserRoleIds(user.id, user.tenantId);
    if (roleIds.length === 0) {
      throw new ForbiddenException('无操作权限');
    }

    // 查询匹配的权限规则
    const rules = await prisma.permissionRule.findMany({
      where: {
        tenantId: user.tenantId,
        roleId: { in: roleIds },
        type,
        action,
        targetId,
        ...(targetNodeId ? { targetNodeId } : {}),
      },
    });

    // Deny-overrides：有 DENY 规则 → 拒绝
    const denyRule = rules.find((r) => r.effect === 'DENY');
    if (denyRule) {
      throw new ForbiddenException('权限规则拒绝此操作');
    }

    // 有 ALLOW 规则 → 通过
    const allowRule = rules.find((r) => r.effect === 'ALLOW');
    if (allowRule) {
      return {
        allowed: true,
        condition: allowRule.condition,
        fieldScope: allowRule.fieldScope as string[] | null,
      };
    }

    // 无匹配规则 → 默认拒绝
    throw new ForbiddenException('无操作权限');
  }

  /**
   * 检查用户是否有权限，返回布尔值（不抛异常）。
   */
  async can(
    user: AuthenticatedUser,
    type: string,
    action: string,
    targetId: string,
  ): Promise<boolean> {
    try {
      await this.check(user, type, action, targetId);
      return true;
    } catch {
      return false;
    }
  }
}
