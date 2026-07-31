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
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException('无效的认证令牌');
    }

    // 加载用户的角色（直接角色 + 组织授权角色）
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({
        where: { userId: payload.sub },
        select: { roleId: true, role: { select: { code: true } } },
      }),
      prisma.orgMember.findMany({
        where: { userId: payload.sub },
        select: { orgId: true },
      }),
    ]);

    let roleIds = userRoles.map((ur) => ur.roleId);
    let roleCodes = userRoles.map((ur) => ur.role.code);

    // 组织授权的角色
    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) } },
        select: { roleId: true, role: { select: { code: true } } },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
      roleCodes = [...new Set([...roleCodes, ...orgGrants.map((g) => g.role.code)])];
    }

    const isSuperAdmin = roleCodes.includes('ADMIN');

    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      roleIds,
      roleCodes,
      isSuperAdmin,
    };
  }
}

/** 认证后的用户信息（注入到 req.user）。 */
export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  /** 用户拥有的所有角色 ID（含组织授权） */
  roleIds: string[];
  /** 角色编码集合 */
  roleCodes: string[];
  /** 是否超级管理员（短路所有权限检查） */
  isSuperAdmin: boolean;
}
