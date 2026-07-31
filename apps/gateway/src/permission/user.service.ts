import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { prisma } from '@apaas/db';

/**
 * 用户管理服务 — 用户 CRUD、角色/组织绑定。
 */
@Injectable()
export class UserService {
  /** 用户列表（支持搜索/按组织/按角色过滤）。 */
  async list(
    tenantId: string,
    params?: { keyword?: string; orgId?: string; roleId?: string },
  ) {
    const where: Record<string, unknown> = { tenantId };

    if (params?.keyword) {
      where.OR = [
        { name: { contains: params.keyword, mode: 'insensitive' } },
        { email: { contains: params.keyword, mode: 'insensitive' } },
      ];
    }

    // 按角色过滤
    if (params?.roleId) {
      where.userRoles = { some: { roleId: params.roleId } };
    }

    // 按组织过滤
    if (params?.orgId) {
      where.orgMemberships = { some: { orgId: params.orgId } };
    }

    return prisma.user.findMany({
      where,
      include: {
        userRoles: { include: { role: true } },
        orgMemberships: { include: { org: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 用户详情（含角色+组织）。 */
  async get(tenantId: string, id: string) {
    const user = await prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        userRoles: { include: { role: true } },
        orgMemberships: { include: { org: true } },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  /** 创建用户。 */
  async create(tenantId: string, data: {
    email: string; name: string; password: string; roleIds?: string[]; orgIds?: string[];
  }) {
    const exists = await prisma.user.findFirst({ where: { tenantId, email: data.email } });
    if (exists) throw new BadRequestException('邮箱已存在');

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        name: data.name,
        passwordHash,
      },
    });

    // 分配角色
    if (data.roleIds?.length) {
      await prisma.userRole.createMany({
        data: data.roleIds.map((roleId) => ({ userId: user.id, roleId })),
        skipDuplicates: true,
      });
    }

    // 分配组织
    if (data.orgIds?.length) {
      await prisma.orgMember.createMany({
        data: data.orgIds.map((orgId) => ({ userId: user.id, orgId })),
        skipDuplicates: true,
      });
    }

    return user;
  }

  /** 更新用户。 */
  async update(tenantId: string, id: string, data: {
    name?: string; avatar?: string; status?: string;
  }) {
    const user = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('用户不存在');
    return prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        ...(data.status !== undefined && { status: data.status as never }),
      },
    });
  }

  /** 删除用户。 */
  async delete(tenantId: string, id: string) {
    const user = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('用户不存在');
    await prisma.user.delete({ where: { id } });
  }

  /** 设置用户角色（替换）。 */
  async setRoles(userId: string, roleIds: string[]) {
    await prisma.userRole.deleteMany({ where: { userId } });
    if (roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      });
    }
  }

  /** 设置用户组织（替换）。 */
  async setOrgs(userId: string, orgIds: string[]) {
    await prisma.orgMember.deleteMany({ where: { userId } });
    if (orgIds.length > 0) {
      await prisma.orgMember.createMany({
        data: orgIds.map((orgId) => ({ userId, orgId })),
      });
    }
  }
}
