import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { prisma } from '@apaas/db';
import type { ApiResponse } from '@apaas/shared';

/**
 * 认证服务：登录、签发 JWT、校验。
 * Phase 0 先实现基础登录（email + password），Phase 4 接入完整权限。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  /**
   * 登录：校验密码，签发 JWT。
   * payload 含 userId / tenantId / email，供下游服务识别租户与用户。
   */
  async login(email: string, password: string): Promise<ApiResponse<{ accessToken: string; user: LoginUserDto }>> {
    const user = await prisma.user.findFirst({
      where: { email, status: 'ACTIVE' },
      include: { tenant: true, userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在或已禁用');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('密码错误');
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log(`用户登录成功: ${user.email} (tenant=${user.tenantId})`);

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
          roles: user.userRoles.map((ur) => ({ id: ur.role.id, code: ur.role.code, name: ur.role.name })),
        },
      },
    };
  }
}

export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
}

export interface LoginUserDto {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  avatar: string | null;
  roles: { id: string; code: string; name: string }[];
}
