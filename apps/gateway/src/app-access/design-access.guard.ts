import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { hasStudioAccess } from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { writeAudit } from '../common/audit.js';
import { AppAccessService } from './app-access.service.js';

/** 设计面闸拒绝文案：无 studio 访问权（END_USER-only 即使被错加成员也进不来——纵深防御）。 */
export const STUDIO_ACCESS_DENIED_MESSAGE = '当前账号无搭建器访问权限';

/**
 * 设计面成员守卫（ADR-0005 决策 9）— 挂在全部 /design/apps/:appId/** 控制器上，
 * 顺序 PermissionGuard（认证 + 角色规则）→ 本守卫（归属）：
 * 1. hasStudioAccess 纵深：平台超管 / TENANT_ADMIN / BUILDER 之外一律 403；
 * 2. 路径带 appId → AppAccessService.assertDesignAccess（admin/owner/member 放行，否则 403）；
 *    角色写入 request.appAccessRole 供控制器做所有者级二次判定；
 * 3. 路径无 appId（/design/apps 列表、创建、分组、待审汇总）→ 放行，由 service 按可见集过滤。
 *
 * 所有者级操作（删除/归档/转移/成员管理）不在守卫层区分——控制器显式调 assertOwnerAccess。
 *
 * 审计（对抗审查 P1-25）：两级拒绝统一补写 PERMISSION_DENIED（ACCESS 类）——
 * PermissionGuard 在前已写入「PERMISSION_CHECK ALLOWED」，本守卫拒绝若不留痕，
 * 取证视角会出现 403 请求对应「权限检查通过」的误导记录。
 */
@Injectable()
export class DesignAccessGuard implements CanActivate {
  constructor(private readonly appAccess: AppAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { params?: Record<string, string | undefined> }>();
    const user = request.user;
    if (!user) return false;

    if (!hasStudioAccess(user.isPlatformAdmin, user.roleCodes)) {
      this.auditDenied(
        request,
        user.tenantId ?? '',
        request.params?.appId ?? null,
        'STUDIO_ACCESS_DENIED',
      );
      throw new ForbiddenException(STUDIO_ACCESS_DENIED_MESSAGE);
    }

    const appId = request.params?.appId;
    if (!appId) return true;

    const tenantId = requireTenantId(request);
    try {
      request.appAccessRole = await this.appAccess.assertDesignAccess(user, tenantId, appId);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        this.auditDenied(request, tenantId, appId, 'DESIGN_ACCESS_DENIED');
      }
      throw err;
    }
    return true;
  }

  /** 归属闸拒绝审计（fire-and-forget，与业务动作审计同形态）。 */
  private auditDenied(
    request: AuthenticatedRequest & { params?: Record<string, string | undefined> },
    tenantId: string,
    appId: string | null,
    reason: 'STUDIO_ACCESS_DENIED' | 'DESIGN_ACCESS_DENIED',
  ): void {
    writeAudit({
      tenantId,
      userId: request.user?.id ?? '',
      action: 'PERMISSION_DENIED',
      resource: 'APPLICATION',
      resourceId: appId,
      appId,
      detail: { gate: 'DESIGN_ACCESS', reason, method: request.method, path: request.url },
    });
  }
}
