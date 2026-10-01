/**
 * 租户/环境上下文拦截器 — HTTP 请求级租户 + 环境 ALS 注入。
 *
 * 在 PermissionGuard（APP_GUARD）之后执行，从已认证的 req.user 中提取 tenantId，
 * 通过 runWithTenant 设置 ALS 上下文，使后续所有 Prisma 查询自动注入 tenantId。
 *
 * R1.4 多环境：从 `?env=` query 或 `X-Env` header 解析环境 key（白名单校验，
 * 缺省 prod——与既有单环境行为等价），经 runWithEnv 写入 ALS；
 * $extends 对 ENV_SCOPED_MODELS 白名单模型自动注入 environmentId。
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
import { runWithEnv } from '@apaas/db';
import { DEFAULT_ENVIRONMENT, ENVIRONMENT_KEYS, type EnvironmentKey } from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

/** 从请求解析环境 key：query.env / header X-Env，白名单外与缺省 → prod */
export function resolveEnvironmentKey(req: {
  query?: Record<string, unknown>;
  headers?: unknown;
}): EnvironmentKey {
  const raw = req.query?.['env'] ?? (req.headers as Record<string, unknown> | undefined)?.['x-env'];
  if (typeof raw === 'string' && (ENVIRONMENT_KEYS as readonly string[]).includes(raw)) {
    return raw as EnvironmentKey;
  }
  return DEFAULT_ENVIRONMENT;
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = req.user?.tenantId ?? null;

    if (tenantId) {
      return runWithEnv(tenantId, resolveEnvironmentKey(req), () => next.handle());
    }

    // 平台管理员或未认证请求：不设租户上下文
    // $extends 扩展将跳过注入（JWT 认证、健康检查等系统路径安全）
    return next.handle();
  }
}
