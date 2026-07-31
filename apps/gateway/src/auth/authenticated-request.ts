/**
 * 认证请求类型 — 供所有 Controller 复用。
 *
 * req.user 由 JwtStrategy.validate() 注入，包含用户 ID、租户、角色等信息。
 */
import type { AuthenticatedUser } from './jwt.strategy.js';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
