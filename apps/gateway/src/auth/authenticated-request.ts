/**
 * 认证请求类型 — 供所有 Controller 复用。
 *
 * req.user 由 JwtStrategy.validate() 注入，包含用户 ID、租户、角色等信息。
 * req.permissionContext 由 PermissionGuard 注入，包含行级条件和字段级范围。
 */
import type { AuthenticatedUser } from './jwt.strategy.js';

/** 权限上下文 — 由 PermissionGuard 从 check() 结果注入到 request 上。 */
export interface PermissionContext {
  /** 行级过滤条件（ABAC），null=无条件，翻译为 Prisma where 子句注入记录查询。 */
  condition: unknown;
  /** 字段级白名单（apiName 数组），null=全部字段可见。 */
  fieldScope: string[] | null;
  /** 当前用户 ID（供条件中 ${currentUser} 变量替换）。 */
  currentUserId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  /** 权限上下文（仅 @RequirePermission 路由且非超管时注入）。 */
  permissionContext?: PermissionContext;
}
