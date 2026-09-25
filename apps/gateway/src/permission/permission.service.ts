import { Injectable, ForbiddenException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

/**
 * 权限引擎 — RBAC + ABAC 混合模型。
 *
 * 核心流程：
 *  1. 超级管理员短路 → 直接通过
 *  2. 查询用户的所有角色（直接角色 + 组织授权角色 + 组织授权扩散继承角色）
 *  3. 查询匹配的 PermissionRule（按 type + action + targetId）
 *  4. Deny-overrides：有 DENY 规则 → 拒绝
 *  5. 有 ALLOW 规则 → 通过，附带 condition/fieldScope 供行级过滤
 *  6. 无匹配规则 → 拒绝（默认拒绝策略）
 */
@Injectable()
export class PermissionService {
  /**
   * 获取用户的所有角色 ID（直接角色 + 组织授权角色 + 组织授权扩散继承角色）。
   *
   * 通过关联表的 tenantId 进行防御性过滤：
   * - UserRole → role.tenantId（确保角色属于同一租户）
   * - OrgMember → org.tenantId（确保组织属于同一租户）
   * - OrgRoleGrant → org.tenantId（确保授权属于同一租户）
   *
   * 组织授权扩散（Phase 4.5，上级自动继承下级权限）：
   * 角色授权给某组织节点后，该节点的全部祖先组织节点的成员自动继承该角色 —
   * 即用户的有效授权范围 = 用户所属组织 ∪ 其全部后代组织上的授权。
   * 场景：部门主管（挂在父节点）无需重复授权即可行使子部门的授权角色。
   * 实现：租户内组织树一次载入（组织节点数量有界），BFS 收集用户组织的全部后代；
   * 访问集防环，树深/环异常时安全终止。
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
    const userOrgIds = orgMembers.map((m) => m.orgId);

    if (userOrgIds.length > 0) {
      // 组织授权扩散：收集用户所属组织的全部后代节点（上级继承下级授权）
      const effectiveOrgIds = await this.getEffectiveOrgIds(tenantId, userOrgIds);

      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: effectiveOrgIds }, orgNode: { tenantId } },
        select: { roleId: true },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
    }

    return roleIds;
  }

  /**
   * 计算用户的有效授权组织集合：所属组织 ∪ 全部后代组织（组织授权扩散）。
   *
   * 租户内组织树一次载入后内存 BFS；visited 集合防御脏数据成环。
   */
  async getEffectiveOrgIds(tenantId: string, userOrgIds: string[]): Promise<string[]> {
    if (userOrgIds.length === 0) return [];

    const nodes = await prisma.orgNode.findMany({
      where: { tenantId },
      select: { id: true, parentId: true },
    });

    // childrenMap: parentId → 子节点列表
    const childrenMap = new Map<string, string[]>();
    for (const node of nodes) {
      if (!node.parentId) continue;
      const bucket = childrenMap.get(node.parentId);
      if (bucket) bucket.push(node.id);
      else childrenMap.set(node.parentId, [node.id]);
    }

    // BFS 收集后代（含用户自身所属组织）
    const effective = new Set<string>(userOrgIds);
    const queue = [...userOrgIds];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const child of childrenMap.get(current) ?? []) {
        if (effective.has(child)) continue; // 防环 + 去重
        effective.add(child);
        queue.push(child);
      }
    }
    return [...effective];
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
