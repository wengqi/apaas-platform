import { Injectable } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { type ChangeSet } from '@apaas/shared';

/**
 * 变更追踪服务 — 记录开发态操作，生成变更清单。
 *
 * 变更追踪采用 ChangeLog 表记录方式：
 * - 各 Service 在 create/update/delete 操作成功后调用 log() 记录变更
 * - getChangeSet() 聚合自上次发布以来的 ChangeLog 记录，按模块分组
 *
 * 注意：log() 失败不应阻塞主操作（catch 后静默失败）。
 */
@Injectable()
export class ChangeLogService {
  /**
   * 记录一条变更日志。
   * 在各 service 的 create/update/delete 操作后调用。
   */
  async log(params: {
    tenantId: string;
    appId: string;
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION' | 'CONNECTOR';
    entityType: string;
    entityId: string;
    entityName?: string;
    changeType: 'CREATE' | 'UPDATE' | 'DELETE';
    changedBy: string;
    changeDescription?: string;
  }): Promise<void> {
    try {
      await prisma.changeLog.create({
        data: {
          tenantId: params.tenantId,
          appId: params.appId,
          module: params.module,
          entityType: params.entityType,
          entityId: params.entityId,
          entityName: params.entityName,
          changeType: params.changeType,
          changedBy: params.changedBy,
          changeDescription: params.changeDescription,
        },
      });
    } catch {
      // 变更追踪失败不应阻塞主操作，静默失败
    }
  }

  /**
   * 获取自上次发布以来的变更清单。
   * 聚合 ChangeLog 记录，按模块分组。
   */
  async getChangeSet(tenantId: string, appId: string): Promise<ChangeSet> {
    // 1. 获取最近一次 PUBLISHED 的 AppVersion
    const lastVersion = await prisma.appVersion.findFirst({
      where: { tenantId, appId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });

    const baselineVersion = lastVersion?.versionNumber ?? null;

    // 2. 查询自上次发布以来的 ChangeLog 记录
    const whereClause = lastVersion
      ? {
          tenantId,
          appId,
          changedAt: { gt: lastVersion.publishedAt },
        }
      : { tenantId, appId };

    const logs = await prisma.changeLog.findMany({
      where: whereClause,
      orderBy: { changedAt: 'desc' },
    });

    // 3. 按模块分组
    const moduleMap = new Map<string, ChangeSet['modules'][number]['changes']>();

    for (const log of logs) {
      const module = log.module;
      if (!moduleMap.has(module)) {
        moduleMap.set(module, []);
      }
      moduleMap.get(module)!.push({
        entityId: log.entityId,
        entityName: log.entityName ?? '',
        changeType: log.changeType as 'CREATE' | 'UPDATE' | 'DELETE',
        changedBy: log.changedBy,
        changedAt: log.changedAt.toISOString(),
        description: log.changeDescription ?? '',
      } as ChangeSet['modules'][number]['changes'][number]);
    }

    return {
      modules: Array.from(moduleMap.entries()).map(([module, changes]) => ({
        module: module as ChangeSet['modules'][number]['module'],
        changes,
      })),
      baselineVersion,
    };
  }
}
