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
  /** 操作详情（JSON） */
  detail?: Record<string, unknown>;
  /** 请求方 IP */
  ip?: string;
}

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
          detail: (params.detail ?? null) as never,
          ip: params.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `审计日志写入失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
