import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import type { PageMeta as PrismaPageMeta } from '@apaas/db';
import {
  asAppId,
  asObjectId,
  asPageId,
  asTenantId,
  type CreatePageRequest,
  type PageMeta,
  type PageSchema,
  type PageType,
  type UpdatePageRequest,
} from '@apaas/shared';

/**
 * 页面服务 — 页面 Schema 存取 CRUD。
 * 对标飞书 aPaaS：页面是搭建器产出的可视化页面，Schema 含组件树 + 视图模型 + 绑定关系。
 *
 * 字段映射说明：
 * - Prisma `apiName` ↔ 共享类型 `slug`（页面路径，运行时路由用）
 * - Prisma `isPublished` ↔ 共享类型 `published`
 */
@Injectable()
export class PageService {
  /**
   * 列出应用下所有页面。
   */
  async list(tenantId: string, appId: string): Promise<PageMeta[]> {
    const pages = await prisma.pageMeta.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return pages.map((p) => this.toPageMeta(p));
  }

  /**
   * 获取页面详情（含完整 Schema）。
   */
  async get(tenantId: string, pageId: string): Promise<PageMeta> {
    const page = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId },
    });
    if (!page) throw new NotFoundException('页面不存在');
    return this.toPageMeta(page);
  }

  /**
   * 按 slug 获取页面（运行时渲染器用）。
   * slug 对应 Prisma 中的 apiName，在应用内唯一。
   */
  async getBySlug(tenantId: string, slug: string): Promise<PageMeta> {
    const page = await prisma.pageMeta.findFirst({
      where: { tenantId, apiName: slug, isPublished: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!page) throw new NotFoundException('页面不存在');
    return this.toPageMeta(page);
  }

  /**
   * 创建页面。
   */
  async create(
    tenantId: string,
    appId: string,
    req: CreatePageRequest,
  ): Promise<PageMeta> {
    const page = await prisma.pageMeta.create({
      data: {
        tenantId,
        appId,
        apiName: req.apiName,
        name: req.name,
        type: req.type,
        objectId: req.objectId,
        schema: (req.schema ?? {}) as unknown as Prisma.InputJsonValue,
        isPublished: false,
      },
    });
    return this.get(tenantId, page.id);
  }

  /**
   * 更新页面（含保存 Schema）。
   */
  async update(
    tenantId: string,
    pageId: string,
    req: UpdatePageRequest,
  ): Promise<PageMeta> {
    await prisma.pageMeta.updateMany({
      where: { id: pageId, tenantId },
      data: {
        name: req.name,
        schema: req.schema as unknown as Prisma.InputJsonValue | undefined,
        isPublished: req.isPublished,
      },
    });
    return this.get(tenantId, pageId);
  }

  /**
   * 删除页面。
   */
  async delete(tenantId: string, pageId: string): Promise<void> {
    const result = await prisma.pageMeta.deleteMany({
      where: { id: pageId, tenantId },
    });
    if (result.count === 0) throw new NotFoundException('页面不存在');
  }

  /**
   * 发布页面（isPublished = true）。
   */
  async publish(tenantId: string, pageId: string): Promise<PageMeta> {
    await prisma.pageMeta.updateMany({
      where: { id: pageId, tenantId },
      data: { isPublished: true },
    });
    return this.get(tenantId, pageId);
  }

  /**
   * 将 Prisma PageMeta 行映射为共享类型 PageMeta。
   */
  private toPageMeta(row: PrismaPageMeta): PageMeta {
    return {
      id: asPageId(row.id),
      tenantId: asTenantId(row.tenantId),
      appId: asAppId(row.appId),
      name: row.name,
      slug: row.apiName,
      type: row.type as PageType,
      objectId: row.objectId ? asObjectId(row.objectId) : undefined,
      schema: row.schema as unknown as PageSchema,
      published: row.isPublished,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
