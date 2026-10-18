import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { prisma } from '@apaas/db';
import { BUILDER_RULES, END_USER_RULES } from '@apaas/shared';

/**
 * 租户管理服务 — 平台超管管理租户的 CRUD + 状态管理。
 *
 * 创建租户时自动初始化内置角色（TENANT_ADMIN / BUILDER / END_USER）及权限规则。
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  /** 创建租户并初始化内置角色与权限规则。 */
  async create(data: { name: string; slug: string; description?: string }) {
    // 校验 slug 唯一
    const existing = await prisma.tenant.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(`租户标识「${data.slug}」已存在`);
    }

    // 创建租户
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        status: 'ACTIVE',
      },
    });

    // 初始化内置角色
    await this.initBuiltInRoles(tenant.id);

    this.logger.log(`租户创建成功: ${tenant.name} (${tenant.slug})`);
    return tenant;
  }

  /** 为新租户初始化内置角色 + 权限规则。 */
  private async initBuiltInRoles(tenantId: string) {
    // TENANT_ADMIN — 租户管理员（靠 isSuperAdmin 短路，无需 PermissionRule）
    await prisma.role.create({
      data: {
        tenantId,
        name: '租户管理员',
        code: 'TENANT_ADMIN',
        description: '管理本租户用户、组织、角色和应用',
        isBuiltIn: true,
      },
    });

    // BUILDER — 应用搭建者
    const builderRole = await prisma.role.create({
      data: {
        tenantId,
        name: '应用搭建者',
        code: 'BUILDER',
        description: '可搭建应用、页面、流程',
        isBuiltIn: true,
      },
    });

    // END_USER — 终端用户
    const endUserRole = await prisma.role.create({
      data: {
        tenantId,
        name: '终端用户',
        code: 'END_USER',
        description: '使用已发布应用、提交申请、审批',
        isBuiltIn: true,
      },
    });

    // BUILDER 权限规则 — SSOT 见 @apaas/shared builtin-roles（seed 同源，防漂移）
    await prisma.permissionRule.createMany({
      data: BUILDER_RULES.map((rule) => ({
        tenantId,
        roleId: builderRole.id,
        type: rule.type,
        action: rule.action,
        targetId: '*',
        effect: 'ALLOW',
      })),
    });

    // END_USER 权限规则 — SSOT 同上（含 PROCESS:VIEW，运行时角色规约）
    await prisma.permissionRule.createMany({
      data: END_USER_RULES.map((rule) => ({
        tenantId,
        roleId: endUserRole.id,
        type: rule.type,
        action: rule.action,
        targetId: '*',
        effect: 'ALLOW',
      })),
    });

    this.logger.log(
      `租户 ${tenantId} 内置角色初始化完成 (TENANT_ADMIN/BUILDER/END_USER + ${BUILDER_RULES.length + END_USER_RULES.length} 条权限规则)`,
    );
  }

  /** 查询租户列表（含用户数、应用数统计）。 */
  async list() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            applications: true,
          },
        },
      },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      status: t.status,
      userCount: t._count.users,
      appCount: t._count.applications,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  /** 查询租户详情。 */
  async get(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            applications: true,
            roles: true,
            orgNodes: true,
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      description: tenant.description,
      status: tenant.status,
      userCount: tenant._count.users,
      appCount: tenant._count.applications,
      roleCount: tenant._count.roles,
      orgCount: tenant._count.orgNodes,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  /** 更新租户信息。 */
  async update(id: string, data: { name?: string; description?: string }) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }
    return prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  /** 挂起租户（status → SUSPENDED）。 */
  async suspend(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }
    if (tenant.status === 'SUSPENDED') {
      throw new BadRequestException('租户已是挂起状态');
    }
    return prisma.tenant.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
  }

  /** 激活租户（status → ACTIVE）。 */
  async activate(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }
    if (tenant.status === 'ACTIVE') {
      throw new BadRequestException('租户已是激活状态');
    }
    return prisma.tenant.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  /** 为租户分配管理员（创建用户 + TENANT_ADMIN 角色）。 */
  async assignAdmin(tenantId: string, data: { email: string; name: string; password: string }) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    // 检查 email 是否已存在
    const existing = await prisma.user.findFirst({
      where: { tenantId, email: data.email },
    });
    if (existing) {
      throw new ConflictException('该邮箱用户已存在');
    }

    // 查找 TENANT_ADMIN 角色
    const adminRole = await prisma.role.findFirst({
      where: { tenantId, code: 'TENANT_ADMIN' },
    });
    if (!adminRole) {
      throw new BadRequestException('租户未初始化 TENANT_ADMIN 角色');
    }

    // 创建用户并分配角色
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        name: data.name,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });

    this.logger.log(`租户 ${tenant.slug} 新增管理员: ${user.email}`);
    return { id: user.id, email: user.email, name: user.name };
  }

  /** 查看租户内用户列表（只读）。 */
  async getUsers(tenantId: string) {
    const users = await prisma.user.findMany({
      where: { tenantId },
      include: {
        userRoles: { include: { role: { select: { code: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status,
      roles: u.userRoles.map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
      })),
      createdAt: u.createdAt,
    }));
  }

  /** 查看租户内应用列表（只读）。 */
  async getApps(tenantId: string) {
    return prisma.application.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        apiName: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
