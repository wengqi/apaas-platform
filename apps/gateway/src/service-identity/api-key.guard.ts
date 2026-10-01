/**
 * ApiKeyGuard（G6）——开放 API 的 X-API-Key 认证。
 *
 * 与 PermissionGuard 平行：不做 JWT，校验通过后合成 request.user
 * （tenantId 供 TenantContextInterceptor 写 ALS、requireTenantId 消费）。
 * 失败统一 401 脱敏。
 */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyService, ServiceIdentityUser } from './api-key.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: ServiceIdentityUser }>();
    const apiKey = (req.headers['x-api-key'] ?? req.headers['X-API-Key']) as string | undefined;
    if (!apiKey) {
      throw new UnauthorizedException('缺少 X-API-Key 请求头');
    }
    req.user = await this.apiKeyService.verify(apiKey);
    return true;
  }
}
