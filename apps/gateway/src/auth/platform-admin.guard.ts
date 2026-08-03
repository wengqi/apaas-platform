import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';

/**
 * 平台超管守卫 — 仅允许 isPlatformAdmin=true 的用户通过。
 * 用于 TenantModule 所有端点（创建/查询/启停租户等）。
 */
@Injectable()
export class PlatformAdminGuard extends JwtAuthGuard {
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return Promise.resolve(super.canActivate(context)).then((result) => {
      if (!result) return false;
      const req = context.switchToHttp().getRequest();
      if (!req.user?.isPlatformAdmin) {
        throw new ForbiddenException('仅平台管理员可执行此操作');
      }
      return true;
    });
  }
}
