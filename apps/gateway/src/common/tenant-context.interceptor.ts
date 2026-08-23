/**
 * 租户上下文拦截器 — HTTP 请求级租户上下文注入。
 *
 * 在 PermissionGuard（APP_GUARD）之后执行，从已认证的 req.user 中提取 tenantId，
 * 通过 runWithTenant 设置 ALS 上下文，使后续所有 Prisma 查询自动注入 tenantId。
 *
 * 平台管理员（tenantId=null）或未认证请求不设租户上下文，
 * Prisma $extends 扩展跳过注入（JWT 认证查询等系统路径安全，因 email/userId 全局唯一）。
 */

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { runWithTenant } from '@apaas/db';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = req.user?.tenantId ?? null;

    if (tenantId) {
      return runWithTenant(tenantId, () => next.handle());
    }

    // 平台管理员或未认证请求：不设租户上下文
    // $extends 扩展将跳过注入（JWT 认证、健康检查等系统路径安全）
    return next.handle();
  }
}
