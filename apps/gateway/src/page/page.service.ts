import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import type { PageMeta as PrismaPageMeta } from '@apaas/db';
import {
  asAppId,
  asObjectId,
  asPageId,
  asTenantId,
  type AppSnapshot,
  type CreatePageRequest,
  type PageMeta,
  type PageSchema,
  type PageType,
  type UpdatePageRequest,
} from '@apaas/shared';
import { ChangeLogService } from '../application/changelog.service.js';

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
  constructor(private readonly changeLogService: ChangeLogService) {}
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
   * 按 slug 获取页面（旧方法，直接读开发态 PageMeta）。
   * 保留用于向后兼容；运行态应使用 getPublishedBySlug。
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
   * 按 slug 获取已发布页面（运行态渲染器用）。
   *
   * 环境隔离核心方法：从 Application.publishedSnapshot 中读取页面 schema，
   * 而非开发态 PageMeta.schema。确保运行态用户只看到已发布版本。
   *
   * Studio 预览模式不受影响 — Studio 通过 GET /pages/:pageId 读取开发态数据。
   */
  async getPublishedBySlug(tenantId: string, appId: string, slug: string): Promise<PageMeta> {
    // 1. 查询 Application，获取 publishedSnapshot
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId },
      select: { publishedSnapshot: true },
    });
    if (!app) throw new NotFoundException('应用不存在');
    if (!app.publishedSnapshot) {
      throw new NotFoundException('应用尚未发布');
    }

    // 2. 从快照中查找匹配 apiName 的页面
    const snapshot = app.publishedSnapshot as unknown as AppSnapshot;
    const pageData = snapshot.pages.find((p: { apiName: string }) => p.apiName === slug);
    if (!pageData) {
      throw new NotFoundException('页面不存在或未发布');
    }

    // 3. 返回快照中的页面数据
    return {
      id: asPageId(pageData.id),
      tenantId: asTenantId(tenantId),
      appId: asAppId(appId),
      name: pageData.name,
      slug: pageData.apiName,
      type: pageData.type as PageType,
      objectId: pageData.objectId ? asObjectId(pageData.objectId) : undefined,
      schema: pageData.schema as unknown as PageSchema,
      published: true,
      createdAt: snapshot.meta.publishedAt,
      updatedAt: snapshot.meta.publishedAt,
    };
  }

  /**
   * 创建页面。
   */
  async create(
    tenantId: string,
    appId: string,
    req: CreatePageRequest,
    changedBy?: string,
  ): Promise<PageMeta> {
    // 仪表盘页面自动生成默认模板（预置栅格 + 图表布局）
    const defaultSchema =
      req.type === 'dashboard' && !req.schema ? generateDashboardSchema() : (req.schema ?? {});

    const page = await prisma.pageMeta.create({
      data: {
        tenantId,
        appId,
        apiName: req.apiName,
        name: req.name,
        type: req.type,
        objectId: req.objectId,
        schema: defaultSchema as unknown as Prisma.InputJsonValue,
        isPublished: false,
      },
    });

    // 记录变更日志
    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'PAGE',
      entityType: 'PageMeta',
      entityId: page.id,
      entityName: req.name,
      changeType: 'CREATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `新建页面: ${req.name}`,
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
    changedBy?: string,
  ): Promise<PageMeta> {
    // 先查 appId（变更日志需要）
    const existing = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId },
      select: { appId: true, name: true },
    });

    await prisma.pageMeta.updateMany({
      where: { id: pageId, tenantId },
      data: {
        name: req.name,
        schema: req.schema as unknown as Prisma.InputJsonValue | undefined,
        isPublished: req.isPublished,
      },
    });

    if (existing) {
      await this.changeLogService.log({
        tenantId,
        appId: existing.appId,
        module: 'PAGE',
        entityType: 'PageMeta',
        entityId: pageId,
        entityName: req.name ?? existing.name,
        changeType: 'UPDATE',
        changedBy: changedBy ?? 'system',
        changeDescription: `更新页面: ${req.name ?? existing.name}`,
      });
    }

    return this.get(tenantId, pageId);
  }

  /**
   * 删除页面。
   */
  async delete(tenantId: string, pageId: string, changedBy?: string): Promise<void> {
    // 先查信息（删除后无法获取）
    const existing = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId },
      select: { appId: true, name: true },
    });

    const result = await prisma.pageMeta.deleteMany({
      where: { id: pageId, tenantId },
    });
    if (result.count === 0) throw new NotFoundException('页面不存在');

    if (existing) {
      await this.changeLogService.log({
        tenantId,
        appId: existing.appId,
        module: 'PAGE',
        entityType: 'PageMeta',
        entityId: pageId,
        entityName: existing.name,
        changeType: 'DELETE',
        changedBy: changedBy ?? 'system',
        changeDescription: `删除页面: ${existing.name}`,
      });
    }
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

/**
 * 生成仪表盘默认 Schema — 预置栅格布局 + 图表组件。
 *
 * 与前端 templates.ts 的 generateDashboardTemplate 保持一致，
 * 确保从 API 创建的仪表盘页也有起始布局。
 */
function generateDashboardSchema(): object {
  const nodeId = (type: string) => `${type}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    version: '1',
    pageType: 'dashboard',
    viewModel: { variables: {} },
    root: {
      id: nodeId('page'),
      name: '仪表盘',
      type: 'page',
      props: {},
      children: [
        {
          id: nodeId('section'),
          name: '数据概览',
          type: 'section',
          props: { title: '数据概览' },
          children: [
            {
              id: nodeId('grid'),
              name: '栅格',
              type: 'grid',
              props: { gutter: 16 },
              children: [
                {
                  id: nodeId('grid_column'),
                  name: '列1',
                  type: 'grid_column',
                  props: { span: 6 },
                  children: [
                    {
                      id: nodeId('statistic'),
                      name: '统计数字',
                      type: 'statistic',
                      props: { title: '总数', value: 0 },
                    },
                  ],
                },
                {
                  id: nodeId('grid_column'),
                  name: '列2',
                  type: 'grid_column',
                  props: { span: 18 },
                  children: [
                    {
                      id: nodeId('chart'),
                      name: '图表1',
                      type: 'chart',
                      props: {
                        chartType: 'bar',
                        title: '数据分布',
                        datasourceType: 'object',
                        datasourceId: '',
                        categoryField: '',
                        valueField: '',
                        aggregation: 'count',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: nodeId('section'),
          name: '趋势分析',
          type: 'section',
          props: { title: '趋势分析' },
          children: [
            {
              id: nodeId('grid'),
              name: '栅格',
              type: 'grid',
              props: { gutter: 16 },
              children: [
                {
                  id: nodeId('grid_column'),
                  name: '列1',
                  type: 'grid_column',
                  props: { span: 12 },
                  children: [
                    {
                      id: nodeId('chart'),
                      name: '图表2',
                      type: 'chart',
                      props: {
                        chartType: 'line',
                        title: '趋势图',
                        datasourceType: 'object',
                        datasourceId: '',
                        categoryField: '',
                        valueField: '',
                        aggregation: 'sum',
                      },
                    },
                  ],
                },
                {
                  id: nodeId('grid_column'),
                  name: '列2',
                  type: 'grid_column',
                  props: { span: 12 },
                  children: [
                    {
                      id: nodeId('chart'),
                      name: '图表3',
                      type: 'chart',
                      props: {
                        chartType: 'pie',
                        title: '占比分布',
                        datasourceType: 'object',
                        datasourceId: '',
                        categoryField: '',
                        valueField: '',
                        aggregation: 'count',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
