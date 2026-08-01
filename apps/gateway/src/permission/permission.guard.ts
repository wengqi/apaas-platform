import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { PERMISSION_KEY, type PermissionMetadata } from './require-permission.decorator.js';
import { PermissionService } from './permission.service.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

/**
 * 权限守卫 — 继承 JwtAuthGuard（先认证），再做授权检查。
 *
 * 流程：
 *  1. JwtAuthGuard 校验 JWT（认证）
 *  2. 读取路由上 @RequirePermission() 装饰器元数据
 *  3. 无装饰器 → 放行（仅认证即可）
 *  4. 有装饰器 → 调用 PermissionService.check() 校验
 *  5. 超级管理员直接放行
 */
@Injectable()
export class PermissionGuard extends JwtAuthGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // 先执行 JWT 认证
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    // 读取权限装饰器元数据
    const permission = this.reflector.get<PermissionMetadata | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // 无装饰器 → 仅认证即可
    if (!permission) return true;

    // 超级管理员短路
    if (user.isSuperAdmin) return true;

    // 从 params 取 targetId
    const targetId = permission.targetIdParam
      ? request.params?.[permission.targetIdParam]
      : undefined;

    // 有 targetId → 检查具体目标级权限
    // 无 targetId（CREATE 等路由 targetId 在 body 中）→ 仍需检查类型+动作级权限
    //   使用通配符 '*' 作为 targetId，检查用户是否有该类型+动作的 ALLOW 规则
    if (targetId) {
      await this.permissionService.check(
        user,
        permission.type,
        permission.action,
        targetId,
      );
    } else {
      // 无具体目标：检查类型+动作级权限（通配符）
      await this.permissionService.check(
        user,
        permission.type,
        permission.action,
        '*',
      );
    }

    return true;
  }
}
