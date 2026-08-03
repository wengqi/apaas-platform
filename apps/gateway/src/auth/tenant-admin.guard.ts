import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';

/**
 * 租户管理员守卫 — 允许平台超管和租户管理员通过。
 *
 * isSuperAdmin 在 JwtStrategy.validate() 中计算：
 *   - 平台超管 (isPlatformAdmin=true) → isSuperAdmin=true
 *   - 租户管理员 (roleCodes 含 TENANT_ADMIN) → isSuperAdmin=true
 *
 * 用于用户/组织/角色管理端点，防止普通用户创建/删除用户或修改角色。
 */
@Injectable()
export class TenantAdminGuard extends JwtAuthGuard {
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return Promise.resolve(super.canActivate(context)).then((result) => {
      if (!result) return false;
      const req = context.switchToHttp().getRequest();
      if (!req.user?.isSuperAdmin) {
        throw new ForbiddenException('需要管理员权限');
      }
      return true;
    });
  }
}
