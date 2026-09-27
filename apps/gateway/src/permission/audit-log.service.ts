/**
 * 审计日志服务 — 记录权限相关操作（鉴权成功/失败、资源增删改）。
 *
 * 审计日志写入设计为非阻塞——失败仅记 error 日志，不影响主操作。
 * 被 PermissionGuard 在权限检查后调用。
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';

export interface AuditLogParams {
  tenantId: string;
  userId: string;
  /** 操作类型，如 PERMISSION_CHECK / PERMISSION_DENIED / CREATE / UPDATE / DELETE */
  action: string;
  /** 资源类型，如 OBJECT / PAGE / PROCESS / ROLE */
  resource?: string;
  /** 资源 ID */
  resourceId?: string;
  /** 应用维度（ROADMAP 9.9 应用级审计 UI）；null 表示平台级事件 */
  appId?: string | null;
  /** 操作详情（JSON） */
  detail?: Record<string, unknown>;
  /** 请求方 IP */
  ip?: string;
}

export interface AuditLogQueryParams {
  tenantId: string;
  page: number;
  pageSize: number;
  action?: string;
  resource?: string;
  userId?: string;
  /** 应用维度过滤（ROADMAP 9.9 应用级审计 UI） */
  appId?: string;
}

export interface AuditLogDto {
  id: string;
  userId: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  appId: string | null;
  detail: unknown;
  ip: string | null;
  createdAt: string;
}

const MAX_PAGE_SIZE = 100;

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  /**
   * 记录一条审计日志。
   * 设计为非阻塞——写入失败仅记日志，不抛异常。
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          action: params.action,
          resource: params.resource ?? null,
          resourceId: params.resourceId ?? null,
          appId: params.appId ?? null,
          detail: (params.detail ?? null) as never,
          ip: params.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`审计日志写入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 分页查询审计日志（支持按操作类型/资源类型/用户筛选）。
   */
  async query(params: AuditLogQueryParams): Promise<{
    items: AuditLogDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const pageSize = Math.min(params.pageSize, MAX_PAGE_SIZE);
    const where: Record<string, unknown> = { tenantId: params.tenantId };
    if (params.action) where.action = params.action;
    if (params.resource) where.resource = params.resource;
    if (params.userId) where.userId = params.userId;
    // ROADMAP 9.9：应用级审计页按 appId 维度过滤
    if (params.appId) where.appId = params.appId;

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toDto(item)),
      total,
      page: params.page,
      pageSize,
    };
  }

  private toDto(item: {
    id: string;
    userId: string;
    action: string;
    resource: string | null;
    resourceId: string | null;
    appId: string | null;
    detail: unknown;
    ip: string | null;
    createdAt: Date;
  }): AuditLogDto {
    return {
      id: item.id,
      userId: item.userId,
      action: item.action,
      resource: item.resource,
      resourceId: item.resourceId,
      appId: item.appId,
      detail: item.detail,
      ip: item.ip,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
