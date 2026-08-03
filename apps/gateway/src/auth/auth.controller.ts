import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service.js';

/**
 * 认证控制器。
 *
 * POST /api/auth/login — 登录端点
 *   body: { email, password, tenantSlug? }
 *   tenantSlug 提供=租户用户登录；不提供=平台超管登录
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginRequest) {
    return this.authService.login(body.email, body.password, body.tenantSlug);
  }
}

export interface LoginRequest {
  email: string;
  password: string;
  /** 租户标识（slug）。提供=租户用户登录；不提供=平台超管登录 */
  tenantSlug?: string;
}
