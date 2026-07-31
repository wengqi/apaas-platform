import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import {
  asAppId,
  asTenantId,
  asUserId,
  type Application,
  type AppSummary,
  type AppStatus,
  type CreateAppRequest,
  type UpdateAppRequest,
} from '@apaas/shared';

/**
 * 应用服务 — Application CRUD。
 * 对标飞书 aPaaS：应用是顶层业务容器，包含对象/页面/流程/权限。
 */
@Injectable()
export class ApplicationService {
  /**
   * 列出租户下所有应用（含资源统计）。
   */
  async list(tenantId: string): Promise<AppSummary[]> {
    const apps = await prisma.application.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { objects: true, pages: true, processes: true },
        },
      },
    });

    return apps.map((app) => ({
      id: asAppId(app.id),
      apiName: app.apiName,
      name: app.name,
      description: app.description ?? undefined,
      icon: app.icon ?? undefined,
      color: app.color ?? undefined,
      status: app.status as AppStatus,
      version: app.version,
      stats: {
        objects: app._count.objects,
        pages: app._count.pages,
        processes: app._count.processes,
      },
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    }));
  }

  /**
   * 获取单个应用详情。
   */
  async get(tenantId: string, appId: string): Promise<Application> {
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId },
    });
    if (!app) throw new NotFoundException('应用不存在');
    return {
      id: asAppId(app.id),
      tenantId: asTenantId(app.tenantId),
      apiName: app.apiName,
      name: app.name,
      description: app.description ?? undefined,
      icon: app.icon ?? undefined,
      color: app.color ?? undefined,
      status: app.status as AppStatus,
      version: app.version,
      publishedSnapshot: app.publishedSnapshot as Record<string, unknown> | undefined,
      publishedAt: app.publishedAt?.toISOString(),
      createdBy: asUserId(app.createdBy),
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    };
  }

  /**
   * 创建应用。
   */
  async create(tenantId: string, createdBy: string, req: CreateAppRequest): Promise<Application> {
    const app = await prisma.application.create({
      data: {
        tenantId,
        apiName: req.apiName,
        name: req.name,
        description: req.description,
        icon: req.icon,
        color: req.color,
        status: 'DRAFT',
        version: 0,
        createdBy,
      },
    });
    return this.get(tenantId, app.id);
  }

  /**
   * 更新应用。
   */
  async update(tenantId: string, appId: string, req: UpdateAppRequest): Promise<Application> {
    await prisma.application.updateMany({
      where: { id: appId, tenantId },
      data: {
        name: req.name,
        description: req.description,
        icon: req.icon,
        color: req.color,
      },
    });
    return this.get(tenantId, appId);
  }

  /**
   * 删除应用。
   */
  async delete(tenantId: string, appId: string): Promise<void> {
    const result = await prisma.application.deleteMany({
      where: { id: appId, tenantId },
    });
    if (result.count === 0) throw new NotFoundException('应用不存在');
  }
}
