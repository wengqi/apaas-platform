import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { AppSnapshot } from '@apaas/shared';

/**
 * 快照收集服务 — 收集应用下所有模块的开发态配置，序列化为 AppSnapshot JSON。
 *
 * 一次嵌套查询拉取：对象(含视图) + 页面(含schema) + 流程(含workflowSchema) + 角色(含权限规则)。
 * 同时收集租户级角色（appId=null），因为租户级权限规则也作用于应用运行态。
 */
@Injectable()
export class SnapshotService {
  /**
   * 收集应用完整配置快照。
   */
  async collectSnapshot(
    tenantId: string,
    appId: string,
    version: string,
    publishedBy: string,
  ): Promise<AppSnapshot> {
    // 1. 查询 Application 基本信息
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId },
    });
    if (!app) throw new NotFoundException('应用不存在');

    // 2. 一次性嵌套查询所有关联资源
    const [objects, pages, processes, appRoles, tenantRoles] = await Promise.all([
      // 对象（含视图）
      prisma.objectMeta.findMany({
        where: { tenantId, appId },
        include: { views: true },
        orderBy: { createdAt: 'asc' },
      }),
      // 页面（含 schema）
      prisma.pageMeta.findMany({
        where: { tenantId, appId },
        orderBy: { createdAt: 'asc' },
      }),
      // 流程（含 workflowSchema）
      prisma.processDef.findMany({
        where: { tenantId, appId },
        orderBy: { createdAt: 'asc' },
      }),
      // 应用级角色（含权限规则）
      prisma.role.findMany({
        where: { tenantId, appId },
        include: { permissionRules: true },
        orderBy: { createdAt: 'asc' },
      }),
      // 租户级角色（appId=null，含该租户的权限规则）
      prisma.role.findMany({
        where: { tenantId, appId: null },
        include: {
          permissionRules: {
            where: {
              OR: [
                { appId: null }, // 租户级规则
                { appId }, // 本应用级规则（通过 roleId 关联到租户级角色的情况）
              ],
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // 3. 组装 AppSnapshot
    const snapshot: AppSnapshot = {
      meta: {
        appId: app.id as AppSnapshot['meta']['appId'],
        appName: app.name,
        apiName: app.apiName,
        version,
        publishedAt: new Date().toISOString(),
        publishedBy: publishedBy as AppSnapshot['meta']['publishedBy'],
      },
      objects: objects.map((obj) => ({
        id: obj.id,
        apiName: obj.apiName,
        name: obj.name,
        description: obj.description,
        icon: obj.icon,
        fields: obj.fields as unknown[],
        isSystem: obj.isSystem,
        views: obj.views.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          config: v.config as Record<string, unknown>,
        })),
      })),
      pages: pages.map((p) => ({
        id: p.id,
        apiName: p.apiName,
        name: p.name,
        type: p.type,
        schema: p.schema as Record<string, unknown>,
        objectId: p.objectId,
      })),
      processes: processes.map((proc) => ({
        id: proc.id,
        apiName: proc.apiName,
        name: proc.name,
        workflowSchema: proc.workflowSchema as Record<string, unknown>,
        triggerType: proc.triggerType,
        bpmnXml: proc.bpmnXml,
      })),
      permissions: {
        roles: [...appRoles, ...tenantRoles].map((role) => ({
          id: role.id,
          name: role.name,
          code: role.code,
          isBuiltIn: role.isBuiltIn,
          rules: role.permissionRules.map((rule) => ({
            id: rule.id,
            type: rule.type,
            action: rule.action,
            targetId: rule.targetId,
            conditions: (rule.condition as Record<string, unknown>) ?? null,
            fieldScope: (rule.fieldScope as string[]) ?? null,
          })),
        })),
      },
    };

    return snapshot;
  }
}
