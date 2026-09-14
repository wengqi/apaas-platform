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
   *
   * 通过关联表的 tenantId 进行防御性过滤：
   * - UserRole → role.tenantId（确保角色属于同一租户）
   * - OrgMember → org.tenantId（确保组织属于同一租户）
   * - OrgRoleGrant → org.tenantId（确保授权属于同一租户）
   */
  async getUserRoleIds(userId: string, tenantId: string): Promise<string[]> {
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({
        where: { userId, role: { tenantId } },
        select: { roleId: true },
      }),
      prisma.orgMember.findMany({
        where: { userId, org: { tenantId } },
        select: { orgId: true },
      }),
    ]);

    let roleIds = userRoles.map((ur) => ur.roleId);

    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) }, orgNode: { tenantId } },
        select: { roleId: true },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
    }

    return roleIds;
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

    // 平台超管无租户上下文，不应走到这里（isSuperAdmin 已短路）
    const tenantId = user.tenantId ?? '';

    const roleIds = await this.getUserRoleIds(user.id, tenantId);
    if (roleIds.length === 0) {
      throw new ForbiddenException('无操作权限');
    }

    // 查询匹配的权限规则（包括通配符 '*' 规则和具体 targetId 规则）
    const rules = await prisma.permissionRule.findMany({
      where: {
        tenantId: tenantId,
        roleId: { in: roleIds },
        type,
        action,
        targetId: { in: [targetId, '*'] },
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
      const rawCondition = allowRule.condition;
      // 空条件（默认 {} / null）= 规则未配置行级限制，归一化为 null。
      // 空对象不能下传 strict 翻译器（恒真语义在 fail-closed 场景被拒绝）。
      const hasCondition =
        rawCondition !== null &&
        rawCondition !== undefined &&
        typeof rawCondition === 'object' &&
        Object.keys(rawCondition as object).length > 0;
      return {
        allowed: true,
        condition: hasCondition ? rawCondition : null,
        fieldScope: allowRule.fieldScope as string[] | null,
      };
    }

    // 无匹配规则 → 默认拒绝
    throw new ForbiddenException('无操作权限');
  }
}
