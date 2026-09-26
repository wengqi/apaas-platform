import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

/**
 * 认证控制器。
 *
 * POST /api/v1/auth/login — 登录端点
 *   body: { email, password, tenantSlug? }
 *   tenantSlug 提供=租户用户登录；不提供=平台超管登录
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  // 评审 H-2：登录端点绑定 auth 限流桶（此前桶已定义但从未绑定，防爆破失效）
  @Throttle({
    auth: {
      limit: Number(process.env.THROTTLE_AUTH_LIMIT) || 10,
      ttl: Number(process.env.THROTTLE_TTL_MS) || 60_000,
    },
  })
  @ApiOperation({ summary: '用户登录', description: '租户用户或平台超管登录' })
  async login(@Body() body: LoginDto) {
    const result = await this.authService.login(body.email, body.password, body.tenantSlug);
    if (!result.ok) {
      throw new UnauthorizedException(result.error.message);
    }
    return { ok: true as const, data: result.data };
  }
}
