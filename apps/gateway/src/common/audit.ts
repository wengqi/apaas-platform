/**
 * 业务动作级审计（评审整改：此前仅有 PERMISSION_CHECK 级审计，业务动作无痕）。
 *
 * 设计为 fire-and-forget：写入失败仅打日志，不阻塞业务主流程。
 * 与 AuditLogService 的区别：该 helper 供无 DI 关联的模块静态调用，
 * 避免跨模块依赖注入带来的循环引用。
 */

import { Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';

const logger = new Logger('Audit');

export interface BusinessAuditParams {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  detail?: Record<string, unknown>;
}

export function writeAudit(params: BusinessAuditParams): void {
  void Promise.resolve()
    .then(() =>
      prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId ?? null,
          detail: (params.detail ?? null) as never,
        },
      }),
    )
    .catch((err: unknown) => {
      logger.error(`业务审计写入失败: ${err instanceof Error ? err.message : String(err)}`);
    });
}
