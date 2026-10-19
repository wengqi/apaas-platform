import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, getEnvironmentId } from '@apaas/db';
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
   * 对象的选择类字段 apiName 集（G3 渲染契约软告警 ctx——crud 列映射契约检查）。
   * 对象无效/无选择字段返回 undefined（validator 缺省跳过该检查，不误报）。
   */
  private async selectFieldApiNames(
    tenantId: string,
    objectId?: string | null,
  ): Promise<ReadonlySet<string> | undefined> {
    if (!objectId) return undefined;
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
      select: { fields: true },
    });
    if (!obj) return undefined;
    const fields = obj.fields as Array<{ apiName?: unknown; type?: unknown }>;
    const names = fields
      .filter((f) => f.type === 'single_select' || f.type === 'multi_select')
      .map((f) => f.apiName)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    return names.length > 0 ? new Set(names) : undefined;
  }

  /**
   * 列出页面保存点（E2-4 飞书式历史，不含 schema 全量，按时间倒序）。
   */
  async listSavePoints(
    tenantId: string,
    appId: string,
    pageId: string,
  ): Promise<PageSavePointInfo[]> {
    await this.requirePage(tenantId, appId, pageId);
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
    appId: string,
    pageId: string,
    savePointId: string,
    changedBy?: string,
  ): Promise<PageMeta> {
    const current = await this.requirePage(tenantId, appId, pageId);
    const point = await prisma.pageSavePoint.findFirst({
      where: { id: savePointId, tenantId, pageId },
    });
    if (!point) throw new NotFoundException('保存点不存在');

    const schema = point.schema as unknown as Prisma.InputJsonValue;
    await prisma.$transaction([
      prisma.pageMeta.updateMany({
        where: { id: pageId, tenantId, appId },
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

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'PAGE',
      entityType: 'PageMeta',
      entityId: pageId,
      entityName: current.name,
      changeType: 'UPDATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `恢复页面历史保存点: ${current.name} @ ${point.createdAt.toISOString()}`,
    });

    return this.get(tenantId, appId, pageId);
  }

  /** 断言页面存在且属于该应用（租户 + 应用双域隔离，ADR-0005），不存在抛 404。 */
  private async requirePage(
    tenantId: string,
    appId: string,
    pageId: string,
  ): Promise<{ id: string; name: string; objectId: string | null }> {
    const page = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId, appId },
      select: { id: true, name: true, objectId: true },
    });
    if (!page) throw new NotFoundException('页面不存在');
    return page;
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
   * 列出应用下所有页面（摘要投影，不含 schema——列表体积控制，
   * MCP list_pages 与 studio 页面列表共用；详情经 get 取回 schema）。
   */
  async list(tenantId: string, appId: string): Promise<PageMeta[]> {
    const pages = await prisma.pageMeta.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        appId: true,
        name: true,
        apiName: true,
        type: true,
        objectId: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return pages.map((p) => this.toPageMeta(p));
  }

  /**
   * 获取页面详情（含完整 Schema）— 设计面 GET /design/apps/:appId/pages/:pageId（活表开发态）。
   */
  async get(tenantId: string, appId: string, pageId: string): Promise<PageMeta> {
    const page = await prisma.pageMeta.findFirst({
      where: { id: pageId, tenantId, appId },
    });
    if (!page) throw new NotFoundException('页面不存在');
    return this.toPageMeta(page);
  }

  /**
   * 运行面页面列表（GET /apps/:appId/pages）— 环境指针指向的已发布 bundle 中的页面
   * （摘要投影，不含 schema），与 getPublishedBySlug / getRuntimeById 同源：
   * 运行时只见已部署面，发布后新建的草稿页不会出现在页签里（ADR-0005 决策 10③）。
   * 未部署返回空数组而非 404——门户已按 Application.status 判定可见，空页签是该降级态的如实呈现。
   */
  async listRuntime(tenantId: string, appId: string): Promise<PageMeta[]> {
    const env = getEnvironmentId() ?? 'prod';
    const resolved = await this.environmentResolver.resolve(tenantId, appId, env);
    if (!resolved.bundle) return [];
    const publishedAt = resolved.bundle.meta.publishedAt;
    return resolved.bundle.pages.map((p) => {
      const { schema: _schema, ...summary } = this.bundlePageToMeta(
        tenantId,
        appId,
        p,
        publishedAt,
      );
      return summary;
    });
  }

  /**
   * 按 slug 获取已发布页面（运行态渲染器用）。
   *
   * 环境隔离核心方法：从环境指针指向的 AppVersion.snapshot（不可变 bundle）中
   * 读取页面 schema，而非开发态 PageMeta.schema。确保运行态用户只看到已发布版本。
   *
   * Studio 预览模式不受影响 — Studio 经设计面 GET /design/apps/:appId/pages/:pageId 读开发态。
   */
  async getPublishedBySlug(tenantId: string, appId: string, slug: string): Promise<PageMeta> {
    // R1.4：环境解析（ALS env，缺省 prod）——指针→AppVersion.bundle，未部署即 404
    const env = getEnvironmentId() ?? 'prod';
    const resolved = await this.environmentResolver.resolve(tenantId, appId, env);
    if (!resolved.bundle) throw new NotFoundException('应用尚未发布');

    const pageData = resolved.bundle.pages.find((p) => p.apiName === slug);
    if (!pageData) {
      throw new NotFoundException('页面不存在或未发布');
    }
    return this.bundlePageToMeta(tenantId, appId, pageData, resolved.bundle.meta.publishedAt);
  }

  /**
   * 运行时按 ID 读页面（R1.4 审批页渲染入口，GET /apps/:appId/pages/:pageId）——环境指针
   * 指向的已发布 bundle，未部署 / bundle 不含该页面即 404（无活表兜底）。
   * Studio 编辑器走设计面读活表开发态，两者语义分离。
   */
  async getRuntimeById(tenantId: string, appId: string, pageId: string): Promise<PageMeta> {
    const env = getEnvironmentId() ?? 'prod';
    const resolved = await this.environmentResolver.resolve(tenantId, appId, env);
    const pageData = resolved.bundle?.pages.find((p) => p.id === pageId);
    if (!resolved.bundle || !pageData) {
      throw new NotFoundException('页面不存在或未发布');
    }
    return this.bundlePageToMeta(tenantId, appId, pageData, resolved.bundle.meta.publishedAt);
  }

  /** 已发布 bundle 中的页面 → PageMeta（三个运行面读方法共用投影）。 */
  private bundlePageToMeta(
    tenantId: string,
    appId: string,
    pageData: {
      id: string;
      name: string;
      apiName: string;
      type: string;
      objectId?: string | null;
      schema?: unknown;
    },
    publishedAt: string,
  ): PageMeta {
    return {
      id: asPageId(pageData.id),
      tenantId: asTenantId(tenantId),
      appId: asAppId(appId),
      name: pageData.name,
      slug: pageData.apiName,
      apiName: pageData.apiName,
      type: pageData.type as PageType,
      objectId: pageData.objectId ? asObjectId(pageData.objectId) : undefined,
      schema: pageData.schema as unknown as PageSchema,
      published: true,
      createdAt: publishedAt,
      updatedAt: publishedAt,
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
    // R1.7 第二轮：页面统一 amis 方言——无 schema 时产出 amis 空页 scaffold
    // （v1 generateDashboardSchema 已随 v1 渲染轨退役；能力口径 = amis 原生）
    const defaultSchema = req.schema ?? {
      type: 'page',
      title: req.name,
      body: [],
    };

    // R1.7 第二轮③：页面唯一方言 = amis，create 一律过 G3 合同（硬闸）
    const check = this.schemaContract.validate('amis_page', defaultSchema, {
      selectFieldApiNames: await this.selectFieldApiNames(tenantId, req.objectId),
    });
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

    return this.get(tenantId, appId, page.id);
  }

  /**
   * 更新页面（含保存 Schema）。
   */
  async update(
    tenantId: string,
    appId: string,
    pageId: string,
    req: UpdatePageRequest,
    changedBy?: string,
  ): Promise<PageMeta> {
    const existing = await this.requirePage(tenantId, appId, pageId);

    // R1.7 第二轮③：页面唯一方言 = amis，schema 更新一律过 G3 合同（硬闸，无 v1 旁路）
    if (req.schema) {
      const check = this.schemaContract.validate('amis_page', req.schema, {
        selectFieldApiNames: await this.selectFieldApiNames(tenantId, existing.objectId),
      });
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
      where: { id: pageId, tenantId, appId },
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

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'PAGE',
      entityType: 'PageMeta',
      entityId: pageId,
      entityName: req.name ?? existing.name,
      changeType: 'UPDATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `更新页面: ${req.name ?? existing.name}`,
    });

    return this.get(tenantId, appId, pageId);
  }

  /**
   * 删除页面。
   */
  async delete(tenantId: string, appId: string, pageId: string, changedBy?: string): Promise<void> {
    // 先查信息（删除后无法获取）
    const existing = await this.requirePage(tenantId, appId, pageId);

    const result = await prisma.pageMeta.deleteMany({
      where: { id: pageId, tenantId, appId },
    });
    if (result.count === 0) throw new NotFoundException('页面不存在');

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'PAGE',
      entityType: 'PageMeta',
      entityId: pageId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: changedBy ?? 'system',
      changeDescription: `删除页面: ${existing.name}`,
    });
  }

  /**
   * 发布页面（isPublished = true）。
   */
  async publish(tenantId: string, appId: string, pageId: string): Promise<PageMeta> {
    const result = await prisma.pageMeta.updateMany({
      where: { id: pageId, tenantId, appId },
      data: { isPublished: true },
    });
    if (result.count === 0) throw new NotFoundException('页面不存在');
    return this.get(tenantId, appId, pageId);
  }

  /**
   * 将 Prisma PageMeta 行映射为共享类型 PageMeta。
   */
  private toPageMeta(
    row: Omit<PrismaPageMeta, 'schema'> & { schema?: PrismaPageMeta['schema'] },
  ): PageMeta {
    return {
      id: asPageId(row.id),
      tenantId: asTenantId(row.tenantId),
      appId: asAppId(row.appId),
      name: row.name,
      slug: row.apiName,
      apiName: row.apiName,
      type: row.type as PageType,
      objectId: row.objectId ? asObjectId(row.objectId) : undefined,
      schema: (row.schema as unknown as PageSchema) ?? undefined,
      published: row.isPublished,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
