import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { AppAccessService } from './app-access.service.js';

/**
 * 数据面双门守卫（对抗审查 devil-01/R1，P0-9）——挂在 record / chart-data 控制器上，
 * 顺序 PermissionGuard（认证 + RECORD:* 角色权限）→ 本守卫（应用级双门）：
 *
 *   放行 = 设计面可访问（admin/owner/member，保 studio 对 DRAFT 应用的搭建期预览）
 *   OR 运行面可见（已发布 + 角色权限归纳，保 END_USER 消费已发布应用数据）。
 *   两者皆否 → 404「应用不存在」（运行时视角应用尚不存在，对齐 ADR-0005 决策 12——
 *   此前这些端点对 DRAFT/未发布应用照常供数，运行面 blanket 404 被数据端点证伪）。
 *
 * appId 解析（按路由形态）：params.appId（chart-data）> params.objectId（对象寻址路由）
 * > params.recordId（记录直达）> body.recordIds（批量，可跨对象，逐 appId 断言）。
 * 每请求新增 1~2 次元数据查询（scale-05 同带，可接受；评审已登记权限路径零缓存问题）。
 */
@Injectable()
export class DataAppAccessGuard implements CanActivate {
  constructor(private readonly appAccess: AppAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<
        AuthenticatedRequest & { params?: Record<string, string | undefined>; body?: unknown }
      >();
    const user = request.user;
    if (!user) return false;

    const tenantId = requireTenantId(request);
    const appIds = await this.resolveTargetAppIds(request);
    for (const appId of appIds) {
      await this.appAccess.assertDataAccess(tenantId, user, appId);
    }
    return true;
  }

  /** 从路由形态解析目标应用（可能多个——批量路由可跨对象）。 */
  private async resolveTargetAppIds(
    request: AuthenticatedRequest & { params?: Record<string, string | undefined>; body?: unknown },
  ): Promise<string[]> {
    const params = request.params ?? {};
    if (params.appId) return [params.appId];

    if (params.objectId) {
      const appId = await this.objectAppId(params.objectId);
      return appId ? [appId] : [];
    }

    if (params.recordId) {
      const record = await prisma.record.findUnique({
        where: { id: params.recordId },
        select: { objectId: true },
      });
      if (!record) throw new NotFoundException('记录不存在');
      const appId = await this.objectAppId(record.objectId);
      return appId ? [appId] : [];
    }

    // 批量路由（batch-update / batch-delete）：body.recordIds，可跨对象
    const body = request.body as { recordIds?: unknown } | undefined;
    const ids = Array.isArray(body?.recordIds)
      ? (body!.recordIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    if (ids.length === 0) return [];
    const records = await prisma.record.findMany({
      where: { id: { in: ids } },
      select: { objectId: true },
    });
    const appIds = new Set<string>();
    for (const objectId of records.map((r) => r.objectId)) {
      const appId = await this.objectAppId(objectId);
      if (appId) appIds.add(appId);
    }
    return [...appIds];
  }

  private async objectAppId(objectId: string): Promise<string | null> {
    const meta = await prisma.objectMeta.findUnique({
      where: { id: objectId },
      select: { appId: true },
    });
    if (!meta) throw new NotFoundException('对象不存在');
    return meta.appId;
  }
}
