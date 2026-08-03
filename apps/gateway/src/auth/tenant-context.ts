import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request.js';

/**
 * 从认证请求中提取 tenantId。
 *
 * 平台超管（isPlatformAdmin=true）的 tenantId 为 null，
 * 不允许直接操作租户内资源，应通过租户管理 API 间接操作。
 *
 * 用于应用级控制器（application/object/page/process/record 等），
 * 这些控制器的所有操作都要求在租户上下文内执行。
 */
export function requireTenantId(req: AuthenticatedRequest): string {
  if (!req.user.tenantId) {
    throw new BadRequestException('平台管理员无租户上下文，请通过租户管理操作');
  }
  return req.user.tenantId;
}
