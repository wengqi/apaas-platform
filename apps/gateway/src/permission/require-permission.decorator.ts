import { SetMetadata } from '@nestjs/common';

/**
 * 权限检查元数据 Key。
 */
export const PERMISSION_KEY = 'permission';

/**
 * 权限检查配置。
 */
export interface PermissionMetadata {
  /** 权限维度 */
  type: string;
  /** 权限动作 */
  action: string;
  /** 从 req.params 取 targetId 的参数名（如 'pageId'），不传则不检查具体目标 */
  targetIdParam?: string;
}

/**
 * 声明此路由需要的权限。
 *
 * 用法：
 * ```ts
 * @RequirePermission('PAGE', 'VIEW', 'pageId')
 * @Get('pages/:pageId')
 * async getPage(@Req() req: AuthenticatedRequest) { ... }
 * ```
 *
 * PermissionGuard 会读取此装饰器的元数据，调用 PermissionService.check() 校验。
 * 超级管理员直接放行。未加此装饰器的路由仅做认证（JWT 有效即可）。
 */
export const RequirePermission = (
  type: string,
  action: string,
  targetIdParam?: string,
): MethodDecorator => SetMetadata(PERMISSION_KEY, { type, action, targetIdParam });
