import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { prisma } from '@apaas/db';
import type { ApiResponse } from '@apaas/shared';

/**
 * 认证服务：登录、签发 JWT、校验。
 *
 * 支持两种登录方式：
 *  1. 平台超管登录（无 tenantSlug）— isPlatformAdmin=true 的用户
 *  2. 租户用户登录（带 tenantSlug）— 在指定租户内查找用户
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  /**
   * 登录：校验密码，签发 JWT。
   *
   * @param email 邮箱
   * @param password 密码
   * @param tenantSlug 租户标识（可选）。提供=租户用户登录；不提供=平台超管登录
   */
  async login(
    email: string,
    password: string,
    tenantSlug?: string,
  ): Promise<ApiResponse<{ accessToken: string; user: LoginUserDto }>> {
    let user;

    if (tenantSlug) {
      // 租户用户登录：按 slug 查找租户，再在租户内查找用户
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      if (!tenant) {
        throw new UnauthorizedException('租户不存在');
      }
      if (tenant.status !== 'ACTIVE') {
        throw new UnauthorizedException('租户已被挂起或归档');
      }

      user = await prisma.user.findFirst({
        where: { email, tenantId: tenant.id, status: 'ACTIVE' },
        include: { tenant: true, userRoles: { include: { role: true } } },
      });
    } else {
      // 平台超管登录：查找 isPlatformAdmin=true 的用户
      user = await prisma.user.findFirst({
        where: { email, isPlatformAdmin: true, status: 'ACTIVE' },
        include: { tenant: true, userRoles: { include: { role: true } } },
      });
    }

    if (!user) {
      throw new UnauthorizedException(
        tenantSlug ? '用户不存在或已禁用' : '平台管理员账号不存在，请输入租户标识进行登录',
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('密码错误');
    }

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId, // null for platform admin
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log(
      `用户登录成功: ${user.email} (tenant=${user.tenantId ?? 'platform'}, platformAdmin=${user.isPlatformAdmin})`,
    );

    return {
      ok: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isPlatformAdmin: user.isPlatformAdmin,
          roles: user.userRoles.map((ur) => ({
            id: ur.role.id,
            code: ur.role.code,
            name: ur.role.name,
          })),
        },
      },
    };
  }
}

export interface JwtPayload {
  sub: string; // userId
  tenantId: string | null; // null = 平台超管
  email: string;
  isPlatformAdmin: boolean;
}

export interface LoginUserDto {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  avatar: string | null;
  isPlatformAdmin: boolean;
  roles: { id: string; code: string; name: string }[];
}
