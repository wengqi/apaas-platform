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
  /**
   * 应用域解析（explain 的规则过滤边界，R5 遗留缝隙 2026-10-15）。
   * app 级规则（appId 非空）只应命中所属应用的资源；按目标资源反查所属应用：
   * APPLICATION 的 targetId 即 appId，PAGE/RECORD(对象)/PROCESS 查资源表，
   * 其余类型（CONNECTOR/DATA_MODEL 等租户级）与查不到的资源返回 null=不过滤
   * （行为与历史一致，向后兼容）。
   */
  async resolveAppScope(type: string, targetId: string): Promise<string | null> {
    switch (type) {
      case 'APPLICATION':
        return targetId;
      case 'PAGE':
        return (
          (await prisma.pageMeta.findUnique({ where: { id: targetId }, select: { appId: true } }))
            ?.appId ?? null
        );
      case 'RECORD':
        return (
          (
            await prisma.objectMeta.findUnique({
              where: { id: targetId },
              select: { appId: true },
            })
          )?.appId ?? null
        );
      case 'PROCESS':
        return (
          (
            await prisma.processDef.findUnique({
              where: { id: targetId },
              select: { appId: true },
            })
          )?.appId ?? null
        );
      default:
        return null;
    }
  }

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
    const explanation = await this.explain(user, type, action, targetId, targetNodeId);
    if (explanation.allowed) {
      return {
        allowed: true,
        ...(explanation.reason === 'ALLOW_RULE'
          ? { condition: explanation.mergedCondition, fieldScope: explanation.fieldScope }
          : {}),
      };
    }
    throw new ForbiddenException(
      explanation.reason === 'DENY_RULE' ? '权限规则拒绝此操作' : '无操作权限',
    );
  }

  /**
   * 权限决策过程解释（P1 运维治理：权限查询调试工具）。
   *
   * 与 check 相同的决策语义，但不抛异常，完整返回决策路径：
   * 有效角色集合 → 命中规则（含条件/字段域）→ deny-overrides → 确定性合并结果。
   * 调试端点据此向管理员展示"为什么允许/拒绝"。
   */
  async explain(
    user: AuthenticatedUser,
    type: string,
    action: string,
    targetId: string,
    targetNodeId?: string,
  ): Promise<PermissionExplanation> {
    // 超级管理员短路
    if (user.isSuperAdmin) {
      return {
        allowed: true,
        reason: 'SUPERADMIN',
        roleIds: [],
        matchedRules: [],
        mergedCondition: null,
        fieldScope: null,
      };
    }

    const tenantId = user.tenantId ?? '';
    const roleIds = await this.getUserRoleIds(user.id, tenantId);
    if (roleIds.length === 0) {
      return {
        allowed: false,
        reason: 'NO_ROLES',
        roleIds: [],
        matchedRules: [],
        mergedCondition: null,
        fieldScope: null,
      };
    }

    // 查询匹配的权限规则（包括通配符 '*' 规则和具体 targetId 规则）
    // R5 遗留缝隙修复（2026-10-15）：app 级规则（appId 非空）只命中所属应用的资源——
    // 此前不过滤 appId，B 应用配置的「应用级通配规则」会被判到所有应用的资源上；
    // 租户级规则（appId 空）不受影响。资源查不到/租户级类型不过滤（行为与历史一致）。
    const appScope = await this.resolveAppScope(type, targetId);
    const rules = await prisma.permissionRule.findMany({
      where: {
        tenantId: tenantId,
        roleId: { in: roleIds },
        type,
        action,
        targetId: { in: [targetId, '*'] },
        ...(targetNodeId ? { targetNodeId } : {}),
        ...(appScope ? { OR: [{ appId: null }, { appId: appScope }] } : {}),
      },
    });

    const matchedRules = rules.map((r) => ({
      ruleId: r.id,
      roleId: r.roleId,
      effect: r.effect,
      targetId: r.targetId,
      condition: r.condition,
      fieldScope: r.fieldScope,
    }));

    // Deny-overrides：有 DENY 规则 → 拒绝
    const denyRule = rules.find((r) => r.effect === 'DENY');
    if (denyRule) {
      return {
        allowed: false,
        reason: 'DENY_RULE',
        roleIds,
        matchedRules,
        mergedCondition: null,
        fieldScope: null,
      };
    }

    // 有 ALLOW 规则 → 通过（评审 P1-4：多角色命中多条 ALLOW 时不再依赖
    // findMany 的无序"第一条"，改为确定性合并——condition 取 OR 并集、
    // fieldScope 取并集（任一规则为全字段 null 则整体为 null））
    const allowRules = rules.filter((r) => r.effect === 'ALLOW');
    if (allowRules.length > 0) {
      const conditions = allowRules
        .map((r) => r.condition)
        .filter(
          (c) =>
            c !== null &&
            c !== undefined &&
            typeof c === 'object' &&
            Object.keys(c as object).length > 0,
        ) as Array<Record<string, unknown>>;
      // 空条件（默认 {} / null）= 规则未配置行级限制，归一化为 null。
      // 任一 ALLOW 规则无行级限制 → 合并后无限制。
      const condition =
        conditions.length === 0
          ? null
          : conditions.length === 1
            ? conditions[0]
            : { or: conditions };

      const scopes = allowRules.map((r) => r.fieldScope as string[] | null);
      const fieldScope = scopes.some((s) => s === null || s === undefined)
        ? null
        : (Array.from(new Set(scopes.flat())) as string[]);

      return {
        allowed: true,
        reason: 'ALLOW_RULE',
        roleIds,
        matchedRules,
        mergedCondition: condition,
        fieldScope,
      };
    }

    // 无匹配规则 → 默认拒绝
    return {
      allowed: false,
      reason: 'NO_RULES',
      roleIds,
      matchedRules,
      mergedCondition: null,
      fieldScope: null,
    };
  }
}

/** 权限决策解释（explain 返回值；reason 枚举见各返回点）。 */
export interface PermissionExplanation {
  allowed: boolean;
  /** SUPERADMIN | ALLOW_RULE | NO_ROLES | DENY_RULE | NO_RULES */
  reason: string;
  /** 有效角色 ID 集合（直接角色 + 组织授权扩散；超管为空集） */
  roleIds: string[];
  matchedRules: Array<{
    ruleId: string;
    roleId: string;
    effect: string;
    targetId: string;
    condition: unknown;
    fieldScope: unknown;
  }>;
  /** 合并后的行级条件（OR 并集；无限制为 null） */
  mergedCondition: unknown;
  /** 合并后的字段域（任一规则全字段则 null） */
  fieldScope: string[] | null;
}
