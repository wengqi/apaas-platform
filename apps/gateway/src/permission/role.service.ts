import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';

/**
 * 角色管理服务 — 角色 CRUD、用户分配、权限规则管理。
 */
@Injectable()
export class RoleService {
  /** 列出角色（可按应用过滤）。 */
  async list(tenantId: string, appId?: string) {
    return prisma.role.findMany({
      where: { tenantId, ...(appId ? { appId } : {}) },
      orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** 获取角色详情。 */
  async get(tenantId: string, id: string) {
    const role = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  /** 创建角色。 */
  async create(tenantId: string, data: { name: string; code: string; description?: string; appId?: string }) {
    const exists = await prisma.role.findFirst({
      where: { tenantId, code: data.code },
    });
    if (exists) throw new BadRequestException('角色编码已存在');

    return prisma.role.create({
      data: { tenantId, ...data },
    });
  }

  /** 更新角色。 */
  async update(tenantId: string, id: string, data: { name?: string; description?: string }) {
    const role = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('角色不存在');
    return prisma.role.update({ where: { id }, data });
  }

  /** 删除角色（内置角色不可删）。 */
  async delete(tenantId: string, id: string) {
    const role = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.isBuiltIn) throw new BadRequestException('内置角色不可删除');
    await prisma.role.delete({ where: { id } });
  }

  /** 获取角色下的用户列表。 */
  async getUsers(tenantId: string, roleId: string) {
    // UserRole 无 tenantId 列，先校验角色归属
    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException('角色不存在');
    const userRoles = await prisma.userRole.findMany({
      where: { roleId },
      include: { user: true },
    });
    return userRoles.map((ur) => ur.user);
  }

  /** 批量分配用户到角色。 */
  async assignUsers(tenantId: string, roleId: string, userIds: string[]) {
    // UserRole 无 tenantId 列，校验 role 和所有 user 都属于当前租户
    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException('角色不存在');
    if (userIds.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: userIds }, tenantId },
        select: { id: true },
      });
      if (validUsers.length !== userIds.length) {
        throw new BadRequestException('部分用户不存在或不属于当前租户');
      }
    }
    await prisma.userRole.createMany({
      data: userIds.map((userId) => ({ userId, roleId })),
      skipDuplicates: true,
    });
  }

  /** 移除用户的角色。 */
  async removeUser(tenantId: string, roleId: string, userId: string) {
    // UserRole 无 tenantId 列，校验角色归属
    const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException('角色不存在');
    await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
  }

  /** 获取角色的权限规则列表。 */
  async getPermissionRules(tenantId: string, roleId: string) {
    return prisma.permissionRule.findMany({
      where: { tenantId, roleId },
      orderBy: [{ type: 'asc' }, { action: 'asc' }],
    });
  }

  /** 批量设置权限规则（替换）。 */
  async setPermissionRules(
    tenantId: string,
    roleId: string,
    rules: Array<{
      type: string;
      action: string;
      targetId: string;
      targetNodeId?: string;
      condition?: unknown;
      fieldScope?: string[] | null;
      effect?: string;
      appId?: string;
    }>,
  ) {
    // 先删除旧规则，再创建新规则
    await prisma.permissionRule.deleteMany({ where: { tenantId, roleId } });
    if (rules.length === 0) return;

    await prisma.permissionRule.createMany({
      data: rules.map((r) => ({
        tenantId,
        roleId,
        type: r.type,
        action: r.action,
        targetId: r.targetId,
        targetNodeId: r.targetNodeId ?? null,
        condition: (r.condition ?? undefined) as never,
        fieldScope: r.fieldScope ?? Prisma.JsonNull,
        effect: r.effect ?? 'ALLOW',
        appId: r.appId ?? null,
      })),
    });
  }
}
