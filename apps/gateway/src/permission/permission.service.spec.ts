/**
 * PermissionService 单元测试 — RBAC + ABAC 权限引擎。
 *
 * 测试覆盖：
 * - 超级管理员短路
 * - 角色加载（直接角色 + 组织授权角色）
 * - Deny-overrides 策略
 * - ALLOW 规则（附带 condition / fieldScope）
 * - 默认拒绝（无匹配规则）
 * - 通配符 targetId 匹配
 * - targetNodeId 过滤
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import {
  makeUser,
  makeSuperAdmin,
  makeUserRole,
  makeOrgMember,
  makeOrgRoleGrant,
  makePermissionRule,
} from '../test/mock-factories.js';

describe('PermissionService', () => {
  const prisma = getMockPrisma();
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
  });

  // =========================================================================
  // getUserRoleIds
  // =========================================================================

  describe('getUserRoleIds', () => {
    it('返回用户的直接角色 + 组织授权角色', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        makeUserRole({ roleId: 'role-001' }),
        makeUserRole({ roleId: 'role-002', id: 'ur-002' }),
      ]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember({ orgId: 'org-001' })]);
      prisma.orgRoleGrant.findMany.mockResolvedValue([makeOrgRoleGrant({ roleId: 'role-003' })]);

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-001', 'role-002', 'role-003']);
    });

    it('无组织成员身份时不查询组织角色授权', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-001']);
      expect(prisma.orgRoleGrant.findMany).not.toHaveBeenCalled();
    });

    it('角色去重 — 同一角色通过直接和组织授权两次获得时只出现一次', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole({ roleId: 'role-001' })]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember()]);
      prisma.orgRoleGrant.findMany.mockResolvedValue([makeOrgRoleGrant({ roleId: 'role-001' })]);

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-001']);
    });

    // =========================================================================
    // 组织授权扩散（Phase 4.5）— 上级自动继承下级权限
    // =========================================================================

    /** 组织树 mock：root → dept-a / dept-b；dept-a → team-a1。 */
    function mockOrgTree() {
      prisma.orgNode.findMany.mockResolvedValue([
        { id: 'org-root', parentId: null },
        { id: 'org-dept-a', parentId: 'org-root' },
        { id: 'org-dept-b', parentId: 'org-root' },
        { id: 'org-team-a1', parentId: 'org-dept-a' },
      ]);
    }

    it('父组织成员继承子组织的授权角色（上级继承下级）', async () => {
      mockOrgTree();
      // 用户属于父节点 org-dept-a；角色授权给了子节点 org-team-a1
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember({ orgId: 'org-dept-a' })]);
      prisma.orgRoleGrant.findMany.mockImplementation(
        async (args: { where: { orgId: { in: string[] } } }) => {
          const grantsOn = args.where.orgId.in;
          return grantsOn.includes('org-team-a1')
            ? [makeOrgRoleGrant({ roleId: 'role-child' })]
            : [];
        },
      );

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-child']);
    });

    it('多级嵌套：祖父节点成员继承孙子节点的授权角色', async () => {
      mockOrgTree();
      // 用户属于根节点；授权挂在 team-a1（root → dept-a → team-a1）
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember({ orgId: 'org-root' })]);
      prisma.orgRoleGrant.findMany.mockImplementation(
        async (args: { where: { orgId: { in: string[] } } }) =>
          args.where.orgId.in.includes('org-team-a1')
            ? [makeOrgRoleGrant({ roleId: 'role-grandchild' })]
            : [],
      );

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-grandchild']);
    });

    it('兄弟组织隔离：兄弟节点的授权不扩散', async () => {
      mockOrgTree();
      // 用户属于 dept-a；授权只挂在兄弟节点 dept-b
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember({ orgId: 'org-dept-a' })]);
      prisma.orgRoleGrant.findMany.mockImplementation(
        async (args: { where: { orgId: { in: string[] } } }) =>
          args.where.orgId.in.includes('org-dept-b')
            ? [makeOrgRoleGrant({ roleId: 'role-sibling' })]
            : [],
      );

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual([]);
    });

    it('扩散继承角色与直接角色合并去重', async () => {
      mockOrgTree();
      prisma.userRole.findMany.mockResolvedValue([makeUserRole({ roleId: 'role-direct' })]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember({ orgId: 'org-dept-a' })]);
      prisma.orgRoleGrant.findMany.mockResolvedValue([
        makeOrgRoleGrant({ roleId: 'role-direct' }),
        makeOrgRoleGrant({ roleId: 'role-inherited', id: 'gr-2' }),
      ]);

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-direct', 'role-inherited']);
    });

    it('用户属于多个组织：有效授权范围为各组织后代的并集', async () => {
      mockOrgTree();
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([
        makeOrgMember({ orgId: 'org-dept-a', userId: 'user-001' }),
        makeOrgMember({ orgId: 'org-dept-b', id: 'om-2', userId: 'user-001' }),
      ]);
      prisma.orgRoleGrant.findMany.mockImplementation(
        async (args: { where: { orgId: { in: string[] } } }) => {
          const inScope = args.where.orgId.in;
          const grants: Array<Record<string, unknown>> = [];
          if (inScope.includes('org-team-a1')) grants.push(makeOrgRoleGrant({ roleId: 'role-a1' }));
          if (inScope.includes('org-dept-b'))
            grants.push(makeOrgRoleGrant({ roleId: 'role-b', id: 'gr-2' }));
          return grants;
        },
      );

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-a1', 'role-b']);
    });

    it('组织树含环（脏数据）：BFS 安全终止不死循环', async () => {
      prisma.orgNode.findMany.mockResolvedValue([
        { id: 'org-x', parentId: 'org-y' },
        { id: 'org-y', parentId: 'org-x' },
      ]);
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember({ orgId: 'org-x' })]);
      prisma.orgRoleGrant.findMany.mockResolvedValue([makeOrgRoleGrant({ roleId: 'role-cycle' })]);

      const roleIds = await service.getUserRoleIds('user-001', 'tenant-001');

      expect(roleIds).toEqual(['role-cycle']);
    });

    it('getEffectiveOrgIds：返回所属组织与全部后代组织', async () => {
      mockOrgTree();

      const ids = await service.getEffectiveOrgIds('tenant-001', ['org-root']);

      expect(ids).toEqual(['org-root', 'org-dept-a', 'org-dept-b', 'org-team-a1']);
    });
  });

  // =========================================================================
  // check — 超级管理员短路
  // =========================================================================

  describe('check — super admin', () => {
    it('isSuperAdmin=true 时直接返回 allowed，不查询任何数据', async () => {
      const admin = makeSuperAdmin();
      const result = await service.check(admin, 'RECORD', 'READ', 'obj-001');

      expect(result).toEqual({ allowed: true });
      expect(prisma.userRole.findMany).not.toHaveBeenCalled();
      expect(prisma.permissionRule.findMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // check — Deny-overrides
  // =========================================================================

  describe('check — deny-overrides', () => {
    it('有 DENY 规则时抛出 ForbiddenException，即使同时存在 ALLOW 规则', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ effect: 'ALLOW', targetId: 'obj-001' }),
        makePermissionRule({ effect: 'DENY', targetId: 'obj-001', id: 'rule-002' }),
      ]);

      const user = makeUser();
      await expect(service.check(user, 'RECORD', 'READ', 'obj-001')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('DENY 规则优先于 ALLOW — 顺序无关', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ effect: 'DENY' }),
        makePermissionRule({ effect: 'ALLOW', id: 'rule-002' }),
      ]);

      await expect(service.check(makeUser(), 'RECORD', 'READ', 'obj-001')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // check — ALLOW
  // =========================================================================

  describe('check — allow', () => {
    it('有 ALLOW 规则时返回 allowed=true，附带 condition 和 fieldScope', async () => {
      const condition = { '==': [{ var: 'createdBy' }, { var: 'currentUser' }] };
      const fieldScope = ['name', 'status'];

      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({
          effect: 'ALLOW',
          targetId: 'obj-001',
          condition,
          fieldScope,
        }),
      ]);

      const result = await service.check(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(true);
      expect(result.condition).toEqual(condition);
      expect(result.fieldScope).toEqual(fieldScope);
    });

    it('ALLOW 规则 condition 为 null 时不附加条件', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ effect: 'ALLOW', condition: null, fieldScope: null }),
      ]);

      const result = await service.check(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(true);
      expect(result.condition).toBeNull();
      expect(result.fieldScope).toBeNull();
    });
  });

  // =========================================================================
  // check — 默认拒绝
  // =========================================================================

  describe('check — default deny', () => {
    it('无匹配规则时抛出 ForbiddenException', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([]);

      await expect(service.check(makeUser(), 'RECORD', 'READ', 'obj-001')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('用户无任何角色时抛出 ForbiddenException', async () => {
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([]);

      await expect(service.check(makeUser(), 'RECORD', 'READ', 'obj-001')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // check — 通配符 targetId
  // =========================================================================

  describe('check — wildcard targetId', () => {
    it('查询条件包含 targetId 和通配符 *', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ effect: 'ALLOW', targetId: '*' }),
      ]);

      const result = await service.check(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(true);
      const findManyCall = prisma.permissionRule.findMany.mock.calls[0]![0];
      expect(findManyCall.where.targetId).toEqual({ in: ['obj-001', '*'] });
    });
  });

  // =========================================================================
  // check — targetNodeId 过滤
  // =========================================================================

  describe('check — targetNodeId', () => {
    it('传入 targetNodeId 时查询条件应包含该字段', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ effect: 'ALLOW', targetNodeId: 'node-001' }),
      ]);

      const result = await service.check(makeUser(), 'PAGE', 'READ', 'page-001', 'node-001');

      expect(result.allowed).toBe(true);
      const findManyCall = prisma.permissionRule.findMany.mock.calls[0]![0];
      expect(findManyCall.where.targetNodeId).toBe('node-001');
    });

    it('不传 targetNodeId 时查询条件不应包含该字段', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([makePermissionRule({ effect: 'ALLOW' })]);

      await service.check(makeUser(), 'RECORD', 'READ', 'obj-001');

      const findManyCall = prisma.permissionRule.findMany.mock.calls[0]![0];
      expect(findManyCall.where).not.toHaveProperty('targetNodeId');
    });
  });

  // =========================================================================
  // check — 组织授权角色参与权限检查
  // =========================================================================

  describe('check — org role grants', () => {
    it('组织授权的角色也参与权限规则匹配', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole({ roleId: 'role-001' })]);
      prisma.orgMember.findMany.mockResolvedValue([makeOrgMember()]);
      prisma.orgRoleGrant.findMany.mockResolvedValue([makeOrgRoleGrant({ roleId: 'role-003' })]);
      // role-003 有 ALLOW 规则
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({
          effect: 'ALLOW',
          targetId: 'obj-001',
          roleId: 'role-003',
        }),
      ]);

      const result = await service.check(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(true);
      // 查询条件应包含 role-001 和 role-003
      const findManyCall = prisma.permissionRule.findMany.mock.calls[0]![0];
      expect(findManyCall.where.roleId).toEqual({ in: ['role-001', 'role-003'] });
    });
  });
  // =========================================================================
  // explain — 权限调试（P1 运维治理）：与 check 同语义但不抛异常，返回决策路径
  // =========================================================================

  describe('explain — 权限调试', () => {
    it('无角色：allowed=false + reason=NO_ROLES', async () => {
      prisma.userRole.findMany.mockResolvedValue([]);
      prisma.orgMember.findMany.mockResolvedValue([]);

      const result = await service.explain(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('NO_ROLES');
      expect(result.roleIds).toEqual([]);
    });

    it('DENY 规则：reason=DENY_RULE + 命中规则完整列出（含条件/字段域）', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ targetId: 'obj-001' }),
        makePermissionRule({ effect: 'DENY', targetId: 'obj-001', id: 'rule-deny' }),
      ]);

      const result = await service.explain(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('DENY_RULE');
      expect(result.matchedRules).toHaveLength(2);
      expect(result.matchedRules.map((r) => r.ruleId)).toEqual(['rule-001', 'rule-deny']);
    });

    it('单条带条件 ALLOW：mergedCondition 透传 + fieldScope 透传', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      const condition = { '==': [{ var: '__currentUser' }, 'user-001'] };
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ targetId: 'obj-001', condition, fieldScope: ['amount'] }),
      ]);

      const result = await service.explain(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ALLOW_RULE');
      expect(result.mergedCondition).toEqual(condition);
      expect(result.fieldScope).toEqual(['amount']);
    });

    it('多条 ALLOW：mergedCondition 取 OR 并集（确定性合并）', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      const c1 = { '==': [{ var: 'owner' }, 'user-001'] };
      const c2 = { '>': [{ var: 'amount' }, 1000000] };
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ targetId: 'obj-001', condition: c1, id: 'rule-a' }),
        makePermissionRule({ targetId: 'obj-001', condition: c2, id: 'rule-b' }),
      ]);

      const result = await service.explain(makeUser(), 'RECORD', 'READ', 'obj-001');

      expect(result.mergedCondition).toEqual({ or: [c1, c2] });
    });

    it('无规则：reason=NO_RULES（默认拒绝）', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([]);

      const result = await service.explain(makeUser(), 'RECORD', 'READ', 'obj-404');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('NO_RULES');
    });
  });

  // =========================================================================
  // explain — rule.appId 应用域过滤（R5 遗留缝隙：app 级规则只命中所属应用）
  // =========================================================================

  describe('explain — rule.appId 应用域过滤', () => {
    it('RECORD 目标：按对象所属应用过滤规则（租户级通配 + 本应用级命中，他应用排除在 where 层）', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.objectMeta.findUnique.mockResolvedValue({ appId: 'app-A' });
      prisma.permissionRule.findMany.mockResolvedValue([
        makePermissionRule({ effect: 'ALLOW', targetId: '*' }),
      ]);

      await service.explain(makeUser(), 'RECORD', 'VIEW', 'obj-001');

      const where = prisma.permissionRule.findMany.mock.calls[0]![0]!.where;
      expect(where.OR).toEqual([{ appId: null }, { appId: 'app-A' }]);
    });

    it('PAGE 目标：按页面所属应用过滤', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.pageMeta.findUnique.mockResolvedValue({ appId: 'app-B' });
      prisma.permissionRule.findMany.mockResolvedValue([]);

      await service.explain(makeUser(), 'PAGE', 'VIEW', 'page-001');

      const where = prisma.permissionRule.findMany.mock.calls[0]![0]!.where;
      expect(where.OR).toEqual([{ appId: null }, { appId: 'app-B' }]);
    });

    it('PROCESS 目标：按流程定义所属应用过滤', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.processDef.findUnique.mockResolvedValue({ appId: 'app-C' });
      prisma.permissionRule.findMany.mockResolvedValue([]);

      await service.explain(makeUser(), 'PROCESS', 'VIEW', 'proc-001');

      const where = prisma.permissionRule.findMany.mock.calls[0]![0]!.where;
      expect(where.OR).toEqual([{ appId: null }, { appId: 'app-C' }]);
    });

    it('APPLICATION 目标：targetId 即 appId，不查资源表', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.permissionRule.findMany.mockResolvedValue([]);

      await service.explain(makeUser(), 'APPLICATION', 'VIEW', 'app-Z');

      const where = prisma.permissionRule.findMany.mock.calls[0]![0]!.where;
      expect(where.OR).toEqual([{ appId: null }, { appId: 'app-Z' }]);
      expect(prisma.pageMeta.findUnique).not.toHaveBeenCalled();
    });

    it('资源查不到或租户级类型（CONNECTOR）：不过滤，行为与历史一致', async () => {
      prisma.userRole.findMany.mockResolvedValue([makeUserRole()]);
      prisma.orgMember.findMany.mockResolvedValue([]);
      prisma.objectMeta.findUnique.mockResolvedValue(null);
      prisma.permissionRule.findMany.mockResolvedValue([]);

      await service.explain(makeUser(), 'RECORD', 'VIEW', 'ghost-obj');

      const where = prisma.permissionRule.findMany.mock.calls[0]![0]!.where;
      expect(where.OR).toBeUndefined();
    });
  });
});
