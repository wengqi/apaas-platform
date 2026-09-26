import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@apaas/db';
import type { JwtPayload } from './auth.service.js';

/**
 * JWT Passport 策略：从 Bearer token 提取并校验。
 * 校验通过后 req.user = AuthenticatedUser（含角色信息）。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
    });
  }

  /**
   * 校验 JWT 并加载用户角色信息。
   * 返回的 AuthenticatedUser 注入到 req.user，供下游 Guard/Service 使用。
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub) {
      throw new UnauthorizedException('无效的认证令牌');
    }

    // 从 DB 验证用户状态（防止已禁用的用户仍持有有效 token）
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        email: true,
        isPlatformAdmin: true,
        status: true,
        tenant: { select: { status: true } },
      },
    });

    if (!dbUser || dbUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户不存在或已禁用');
    }

    // 评审 H-4：租户挂起后存量 JWT 仍有效最长 7 天——每请求联查租户状态
    if (dbUser.tenant && dbUser.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('租户已被挂起或归档');
    }

    // 平台超管：跳过角色加载，直接返回
    if (dbUser.isPlatformAdmin) {
      return {
        id: dbUser.id,
        tenantId: dbUser.tenantId, // null for platform admin
        email: dbUser.email,
        roleIds: [],
        roleCodes: [],
        isPlatformAdmin: true,
        isSuperAdmin: true, // 平台超管短路所有权限检查
      };
    }

    // 租户用户：加载角色（直接角色 + 组织授权角色）
    // 通过关联表的 tenantId 进行防御性过滤，确保角色/组织属于同一租户
    const tenantId = dbUser.tenantId!;
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({
        where: { userId: payload.sub, role: { tenantId } },
        select: { roleId: true, role: { select: { code: true } } },
      }),
      prisma.orgMember.findMany({
        where: { userId: payload.sub, org: { tenantId } },
        select: { orgId: true },
      }),
    ]);

    let roleIds = userRoles.map((ur) => ur.roleId);
    let roleCodes = userRoles.map((ur) => ur.role.code);

    // 组织授权的角色
    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) }, orgNode: { tenantId } },
        select: { roleId: true, role: { select: { code: true } } },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
      roleCodes = [...new Set([...roleCodes, ...orgGrants.map((g) => g.role.code)])];
    }

    // 租户管理员视为超管（短路权限检查）
    const isSuperAdmin = roleCodes.includes('TENANT_ADMIN');

    return {
      id: dbUser.id,
      tenantId: dbUser.tenantId!,
      email: dbUser.email,
      roleIds,
      roleCodes,
      isPlatformAdmin: false,
      isSuperAdmin,
    };
  }
}

/** 认证后的用户信息（注入到 req.user）。 */
export interface AuthenticatedUser {
  id: string;
  /** 租户 ID。null = 平台超管（跨租户） */
  tenantId: string | null;
  email: string;
  /** 用户拥有的所有角色 ID（含组织授权）。平台超管为空数组 */
  roleIds: string[];
  /** 角色编码集合 */
  roleCodes: string[];
  /** 是否平台超管（跨租户） */
  isPlatformAdmin: boolean;
  /** 是否超级管理员（平台超管 或 租户管理员），短路所有权限检查 */
  isSuperAdmin: boolean;
}
