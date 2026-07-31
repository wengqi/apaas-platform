import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service.js';

/**
 * 认证控制器。Phase 0 仅提供登录端点。
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginRequest) {
    return this.authService.login(body.email, body.password);
  }
}

export interface LoginRequest {
  email: string;
  password: string;
}
