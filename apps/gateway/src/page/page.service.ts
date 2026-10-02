import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, getEnvironmentId } from '@apaas/db';
import { isAmisPage } from '@apaas/shared';
import type { PageMeta as PrismaPageMeta } from '@apaas/db';
import {
  asAppId,
  asObjectId,
  asPageId,
  asTenantId,
  type CreatePageRequest,
  type PageMeta,
  type PageSavePointInfo,
  type PageSchema,
  type PageType,
  type UpdatePageRequest,
} from '@apaas/shared';
import { EnvironmentResolverService } from '../environment/environment-resolver.service.js';
import { SchemaContractService } from '../schema-contract/schema-contract.service.js';
import { ChangeLogService } from '../application/changelog.service.js';

/**
 * 页面服务 — 页面 Schema 存取 CRUD。
 * 对标飞书 aPaaS：页面是搭建器产出的可视化页面，Schema 含组件树 + 视图模型 + 绑定关系。
 *
 * 字段映射说明：
 * - Prisma `apiName` ↔ 共享类型 `slug`（页面路径，运行时路由用）
 * - Prisma `isPublished` ↔ 共享类型 `published`
 */
/** 每页保留的保存点上限（超出后清理最旧的）。 */
const MAX_SAVE_POINTS_PER_PAGE = 50;

@Injectable()
export class PageService {
  constructor(
    private readonly changeLogService: ChangeLogService,
    private readonly environmentResolver: EnvironmentResolverService,
    private readonly schemaContract: SchemaContractService,
  ) {}

  /**
   * 列出页面保存点（E2-4 飞书式历史，不含 schema 全量，按时间倒序）。
   */
  async listSavePoints(tenantId: string, pageId: string): Promise<PageSavePointInfo[]> {
    await this.requirePage(tenantId, pageId);
    const rows = await prisma.pageSavePoint.findMany({
      where: { tenantId, pageId },
      orderBy: { createdAt: 'desc' },
      take: MAX_SAVE_POINTS_PER_PAGE,
      select: { id: true, pageId: true, source: true, createdBy: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      pageId: asPageId(r.pageId),
      source: r.source === 'restore' ? 'restore' : 'save',
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * 恢复页面到指定保存点：schema 写回页面，并追加一条 restore 回滚点
   * （用户可再次恢复以撤销本次恢复）。
   */
  async restoreSavePoint(
    tenantId: string,
    pageId: string,
    savePointId: string,
    changedBy?: string,
  ): Promise<PageMeta> {
    await this.requirePage(tenantId, pageId);
    const point = await prisma.pageSavePoint.findFirst({
      where: { id: savePointId, tenantId, pageId },
    });
    if (!point) throw new NotFoundException('保存点不存在');

    const schema = point.schema as unknown as Prisma.InputJsonValue;
    await prisma.$transaction([
      prisma.pageMeta.updateMany({
        where: { id: pageId, tenantId },
        data: { schema },
      }),
      prisma.pageSavePoint.create({
        data: {
          tenantId,
          pageId,
          schema,
          source: 'restore',
          createdBy: changedBy ?? 'system',
        },
      }),
    ]);
    await this.pruneSavePoints(tenantId, pageId);

    const current = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId },
      select: { appId: true, name: true },
    });
    if (current) {
      await this.changeLogService.log({
        tenantId,
        appId: current.appId,
        module: 'PAGE',
        entityType: 'PageMeta',
        entityId: pageId,
        entityName: current.name,
        changeType: 'UPDATE',
        changedBy: changedBy ?? 'system',
        changeDescription: `恢复页面历史保存点: ${current.name} @ ${point.createdAt.toISOString()}`,
      });
    }

    return this.get(tenantId, pageId);
  }

  /** 断言页面存在（租户隔离），不存在抛 404。 */
  private async requirePage(tenantId: string, pageId: string): Promise<void> {
    const page = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId },
      select: { id: true },
    });
    if (!page) throw new NotFoundException('页面不存在');
  }

  /** 捕获保存点并裁剪到上限。 */
  private async captureSavePoint(
    tenantId: string,
    pageId: string,
    schema: Prisma.InputJsonValue,
    source: 'save' | 'restore',
    createdBy?: string,
  ): Promise<void> {
    await prisma.pageSavePoint.create({
      data: { tenantId, pageId, schema, source, createdBy: createdBy ?? 'system' },
    });
    await this.pruneSavePoints(tenantId, pageId);
  }

  /** 裁剪保存点：仅保留最近 MAX_SAVE_POINTS_PER_PAGE 条。 */
  private async pruneSavePoints(tenantId: string, pageId: string): Promise<void> {
    const rows = await prisma.pageSavePoint.findMany({
      where: { tenantId, pageId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (rows.length <= MAX_SAVE_POINTS_PER_PAGE) return;
    const staleIds = rows.slice(MAX_SAVE_POINTS_PER_PAGE).map((r) => r.id);
    await prisma.pageSavePoint.deleteMany({ where: { id: { in: staleIds }, tenantId } });
  }
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
   * 环境隔离核心方法：从环境指针指向的 AppVersion.snapshot（不可变 bundle）中
   * 读取页面 schema，而非开发态 PageMeta.schema。确保运行态用户只看到已发布版本。
   *
   * Studio 预览模式不受影响 — Studio 通过 GET /pages/:pageId 读取开发态数据。
   */
  async getPublishedBySlug(tenantId: string, appId: string, slug: string): Promise<PageMeta> {
    // R1.4：环境解析（ALS env，缺省 prod）——指针→AppVersion.bundle，未部署即 404
    const env = getEnvironmentId() ?? 'prod';
    const resolved = await this.environmentResolver.resolve(tenantId, appId, env);
    if (!resolved.bundle) throw new NotFoundException('应用尚未发布');

    const snapshot = resolved.bundle;
    const pageData = snapshot.pages.find((p: { apiName: string }) => p.apiName === slug);
    if (!pageData) {
      throw new NotFoundException('页面不存在或未发布');
    }

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
   * 运行时按 ID 读页面（R1.4 审批页渲染入口）——环境指针指向的已发布 bundle，
   * 未部署 / bundle 不含该页面即 404（无活表兜底）。
   * Studio 编辑器仍走 GET /pages/:pageId 读活表开发态，两者语义分离。
   */
  async getRuntimeById(tenantId: string, appId: string, pageId: string): Promise<PageMeta> {
    const env = getEnvironmentId() ?? 'prod';
    const resolved = await this.environmentResolver.resolve(tenantId, appId, env);
    const pageData = resolved.bundle?.pages.find((p: { id: string }) => p.id === pageId);
    if (!resolved.bundle || !pageData) {
      throw new NotFoundException('页面不存在或未发布');
    }
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
      createdAt: resolved.bundle.meta.publishedAt,
      updatedAt: resolved.bundle.meta.publishedAt,
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

    // R1.7：amis 方言（v2）schema 更新过 G3 合同（硬闸）——v1 不变（搭建器既有语义）
    if (req.schema && isAmisPage(req.schema)) {
      const check = this.schemaContract.validate('amis_page', req.schema);
      if (!check.valid) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: `amis 页面校验失败: ${check.issues
            .filter((i) => i.severity === 'error')
            .slice(0, 3)
            .map((i) => `${i.path} ${i.message}`)
            .join('; ')}`,
        });
      }
    }

    await prisma.pageMeta.updateMany({
      where: { id: pageId, tenantId },
      data: {
        name: req.name,
        schema: req.schema as unknown as Prisma.InputJsonValue | undefined,
        isPublished: req.isPublished,
      },
    });

    // E2-4 飞书式历史：携带 schema 的保存自动捕获保存点
    if (req.schema !== undefined) {
      await this.captureSavePoint(
        tenantId,
        pageId,
        req.schema as unknown as Prisma.InputJsonValue,
        'save',
        changedBy,
      );
    }

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
  const metric1Id = nodeId('statistic');
  const metric2Id = nodeId('statistic');
  const trendId = nodeId('chart');
  const barId = nodeId('chart');
  const pieId = nodeId('chart');
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
          id: nodeId('dashboard_grid'),
          name: '仪表盘网格',
          type: 'dashboard_grid',
          props: {
            cols: 12,
            rowHeight: 30,
            layout: [
              { i: metric1Id, x: 0, y: 0, w: 3, h: 4 },
              { i: metric2Id, x: 3, y: 0, w: 3, h: 4 },
              { i: trendId, x: 6, y: 0, w: 6, h: 8 },
              { i: barId, x: 0, y: 4, w: 6, h: 8 },
              { i: pieId, x: 6, y: 8, w: 6, h: 8 },
            ],
          },
          children: [
            {
              id: metric1Id,
              name: '记录总数',
              type: 'statistic',
              props: {
                title: '记录总数',
                value: 0,
                datasourceType: 'object',
                datasourceId: '',
                valueField: '',
                aggregation: 'count',
                prefix: '',
                suffix: '条',
              },
            },
            {
              id: metric2Id,
              name: '数值汇总',
              type: 'statistic',
              props: {
                title: '数值汇总',
                value: 0,
                datasourceType: 'object',
                datasourceId: '',
                valueField: '',
                aggregation: 'sum',
                prefix: '',
                suffix: '',
              },
            },
            {
              id: trendId,
              name: '趋势图',
              type: 'chart',
              props: {
                chartType: 'line',
                title: '趋势图',
                datasourceType: 'object',
                datasourceId: '',
                categoryField: '',
                valueField: '',
                aggregation: 'sum',
                timeGranularity: 'day',
              },
            },
            {
              id: barId,
              name: '数据分布',
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
            {
              id: pieId,
              name: '占比分布',
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
  };
}
