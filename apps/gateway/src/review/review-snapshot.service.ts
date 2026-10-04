/**
 * 资源快照服务（R1.2）——活表 ↔ 规范快照的双向转换。
 *
 * extract：从活表提取与 ResourceVersion.snapshot 相同形态的规范快照
 *          （OBJECT 仅业务字段——系统字段批准落地时注入，不参与 diff）。
 * apply：把快照落回活表（新建或更新），是「批准生效」与「撤销未提交」
 *        的共同落地路径；页面/流程复用既有 service（保留 ChangeLog/保存点/
 *        触发器注销语义），对象字段整体替换直写（与 MCP 原实现一致）并补
 *        一条 ChangeLog。
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type {
  ObjectResourceSnapshot,
  PageResourceSnapshot,
  PageType,
  ProcessResourceSnapshot,
  ResourceSnapshot,
  ReviewModule,
} from '@apaas/shared';
import { PageService } from '../page/page.service.js';
import { ProcessService } from '../process/process.service.js';
import { ObjectService } from '../object/object.service.js';
import { ChangeLogService } from '../application/changelog.service.js';
import { collectRefTokens } from './review.service.js';

/** 活表资源提取结果 */
export interface LiveResource {
  entityId: string;
  apiName: string;
  name: string;
  snapshot: ResourceSnapshot;
}

type BusinessField = Record<string, unknown>;

/** 仅保留业务字段（系统字段由落地路径注入） */
export function toBusinessFields(fields: unknown): BusinessField[] {
  if (!Array.isArray(fields)) return [];
  return (fields as Array<Record<string, unknown>>).filter((f) => f['isSystem'] !== true);
}

/** 系统 + 业务字段合并（落地时保持系统字段不变） */
export function mergeSystemFields(liveFields: unknown, business: BusinessField[]): BusinessField[] {
  const system = Array.isArray(liveFields)
    ? (liveFields as Array<Record<string, unknown>>).filter((f) => f['isSystem'] === true)
    : [];
  return [...system, ...business];
}

@Injectable()
export class ReviewSnapshotService {
  private readonly logger = new Logger(ReviewSnapshotService.name);

  constructor(
    private readonly pageService: PageService,
    private readonly processService: ProcessService,
    private readonly objectService: ObjectService,
    private readonly changeLogService: ChangeLogService,
  ) {}

  /** 从活表提取规范快照；资源不存在返回 null。 */
  async extractLive(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    entityId: string,
  ): Promise<LiveResource | null> {
    switch (module) {
      case 'OBJECT': {
        const obj = await prisma.objectMeta.findFirst({ where: { id: entityId, tenantId, appId } });
        if (!obj) return null;
        return {
          entityId: obj.id,
          apiName: obj.apiName,
          name: obj.name,
          snapshot: {
            apiName: obj.apiName,
            name: obj.name,
            description: obj.description ?? undefined,
            icon: obj.icon ?? undefined,
            fields: toBusinessFields(obj.fields),
          } satisfies ObjectResourceSnapshot,
        };
      }
      case 'PAGE': {
        const page = await prisma.pageMeta.findFirst({ where: { id: entityId, tenantId, appId } });
        if (!page) return null;
        return {
          entityId: page.id,
          apiName: page.apiName,
          name: page.name,
          snapshot: {
            apiName: page.apiName,
            name: page.name,
            type: page.type,
            objectId: page.objectId,
            schema: page.schema as Record<string, unknown>,
          } satisfies PageResourceSnapshot,
        };
      }
      case 'PROCESS': {
        const def = await prisma.processDef.findFirst({
          where: { id: entityId, tenantId, appId },
        });
        if (!def) return null;
        return {
          entityId: def.id,
          apiName: def.apiName,
          name: def.name,
          snapshot: {
            apiName: def.apiName,
            name: def.name,
            workflowSchema: def.workflowSchema as Record<string, unknown>,
            triggerType: def.triggerType,
            cron: def.cron,
          } satisfies ProcessResourceSnapshot,
        };
      }
    }
  }

  /** 把快照落回活表，返回资源 entityId（新建时回填）。 */
  async applySnapshot(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    snapshot: ResourceSnapshot,
    entityId: string | null,
    changedBy: string,
  ): Promise<string> {
    switch (module) {
      case 'OBJECT':
        return this.applyObject(
          tenantId,
          appId,
          snapshot as ObjectResourceSnapshot,
          entityId,
          changedBy,
        );
      case 'PAGE':
        return this.applyPage(
          tenantId,
          appId,
          snapshot as PageResourceSnapshot,
          entityId,
          changedBy,
        );
      case 'PROCESS':
        return this.applyProcess(
          tenantId,
          appId,
          snapshot as ProcessResourceSnapshot,
          entityId,
          changedBy,
        );
    }
  }

  // ---------------------------------------------------------------------------
  // 各模块落地
  // ---------------------------------------------------------------------------

  private async applyObject(
    tenantId: string,
    appId: string,
    snapshot: ObjectResourceSnapshot,
    entityId: string | null,
    changedBy: string,
  ): Promise<string> {
    // 目标定位：优先显式 entityId，否则按 apiName 解析（审批期间人工已建同名资源的收编语义）
    const target = entityId
      ? await prisma.objectMeta.findFirst({ where: { id: entityId, tenantId, appId } })
      : await prisma.objectMeta.findFirst({
          where: { tenantId, appId, apiName: snapshot.apiName },
        });

    if (target) {
      await prisma.objectMeta.update({
        where: { id: target.id },
        data: {
          name: snapshot.name,
          description: snapshot.description,
          icon: snapshot.icon,
          fields: mergeSystemFields(target.fields, snapshot.fields) as object[],
        },
      });
      await this.changeLogService.log({
        tenantId,
        appId,
        module: 'OBJECT',
        entityType: 'ObjectMeta',
        entityId: target.id,
        entityName: snapshot.name,
        changeType: 'UPDATE',
        changedBy,
        changeDescription: `提交快照落地（${changedBy}）：更新对象 ${snapshot.name} 及其字段`,
      });
      return target.id;
    }

    // 新建：objectService 注入系统字段，再合并业务字段
    const created = await this.objectService.create(tenantId, appId, changedBy, {
      apiName: snapshot.apiName,
      name: snapshot.name,
      description: snapshot.description,
      icon: snapshot.icon ?? '📦',
    });
    await prisma.objectMeta.update({
      where: { id: created.id },
      data: {
        fields: mergeSystemFields(created.fields, snapshot.fields) as object[],
      },
    });
    return created.id;
  }

  private async applyPage(
    tenantId: string,
    appId: string,
    snapshot: PageResourceSnapshot,
    entityId: string | null,
    changedBy: string,
  ): Promise<string> {
    // #18：schema 中 api.url 等字符串字段的 @ref:object:<apiName> 令牌
    // 落地时解析为真实对象 ID（AI 无法预知自建对象的 ID，只能以令牌占位）
    const resolved = (await this.resolveObjectTokens(
      tenantId,
      appId,
      snapshot,
    )) as PageResourceSnapshot;
    const finalSnapshot = resolved ?? snapshot;
    const target = entityId
      ? await prisma.pageMeta.findFirst({ where: { id: entityId, tenantId, appId } })
      : await prisma.pageMeta.findFirst({
          where: { tenantId, appId, apiName: finalSnapshot.apiName },
        });

    if (target) {
      // AI 提交批准只落 schema/名称；上线仍随应用发布（isPublished 语义不变）
      await this.pageService.update(
        tenantId,
        target.id,
        { name: finalSnapshot.name, schema: finalSnapshot.schema as never },
        changedBy,
      );
      return target.id;
    }
    const created = await this.pageService.create(
      tenantId,
      appId,
      {
        apiName: finalSnapshot.apiName,
        name: finalSnapshot.name,
        type: finalSnapshot.type as PageType,
        objectId: finalSnapshot.objectId ?? undefined,
        schema: finalSnapshot.schema as never,
      },
      changedBy,
    );
    return created.id;
  }

  /**
   * 页面 schema 内 @ref:object:<apiName> 令牌解析（#18）。
   * 无令牌时返回 null（调用方沿用原快照，避免无谓深拷贝）。
   */
  private async resolveObjectTokens(
    tenantId: string,
    appId: string,
    snapshot: PageResourceSnapshot,
  ): Promise<PageResourceSnapshot | null> {
    // api.url 中令牌是路径子串（非整串），需串级扫描替换
    const urlTokens = new Set<string>();
    const scanUrls = (v: unknown): void => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(/@ref:object:[a-z][a-z0-9_]*/g)) urlTokens.add(m[0]);
        return;
      }
      if (Array.isArray(v)) {
        v.forEach(scanUrls);
        return;
      }
      if (v !== null && typeof v === 'object') {
        Object.values(v).forEach(scanUrls);
      }
    };
    scanUrls(snapshot.schema);
    // 整串令牌（objectId 等字段值）
    const wholeTokens = collectRefTokens(snapshot.schema);
    const objectTokens = new Set<string>([
      ...[...urlTokens],
      ...[...wholeTokens].filter((t) => t.startsWith('@ref:object:')),
    ]);
    if (objectTokens.size === 0) return null;
    const map = new Map<string, string>();
    for (const token of objectTokens) {
      const apiName = token.replace(/^@ref:object:/, '');
      const obj = await prisma.objectMeta.findFirst({
        where: { tenantId, appId, apiName },
        select: { id: true },
      });
      if (!obj) {
        throw new Error(`页面引用的对象「${apiName}」不存在（@ref 令牌解析失败）`);
      }
      map.set(token, obj.id);
    }
    // URL 子串替换：字符串值按子串替换令牌，其余走整串 map
    const replaceUrls = (v: unknown): unknown => {
      if (typeof v === 'string') {
        let out = v;
        for (const [token, id] of map) out = out.split(token).join(id);
        return out;
      }
      if (Array.isArray(v)) return v.map(replaceUrls);
      if (v !== null && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) out[k] = replaceUrls(val);
        return out;
      }
      return v;
    };
    return replaceUrls(snapshot) as PageResourceSnapshot;
  }

  private async applyProcess(
    tenantId: string,
    appId: string,
    snapshot: ProcessResourceSnapshot,
    entityId: string | null,
    changedBy: string,
  ): Promise<string> {
    const target = entityId
      ? await prisma.processDef.findFirst({ where: { id: entityId, tenantId, appId } })
      : await prisma.processDef.findFirst({
          where: { tenantId, appId, apiName: snapshot.apiName },
        });

    if (target) {
      // updateProcess 对已发布流程会自动降级 DRAFT 并注销定时触发器（治理语义正确：
      // AI 变更批准后需人工重新发布才重新生效）
      await this.processService.updateProcess(
        tenantId,
        target.id,
        {
          name: snapshot.name,
          workflowSchema: snapshot.workflowSchema,
          triggerType: snapshot.triggerType ?? undefined,
          cron: snapshot.cron ?? undefined,
        },
        changedBy,
      );
      return target.id;
    }
    const created = await this.processService.createProcess(
      tenantId,
      appId,
      {
        apiName: snapshot.apiName,
        name: snapshot.name,
        workflowSchema: snapshot.workflowSchema,
        triggerType: snapshot.triggerType ?? 'MANUAL',
      },
      changedBy,
    );
    if (snapshot.cron) {
      // createProcess 不收 cron，SCHEDULED 场景批准后补一次触发配置
      await this.processService.updateProcess(
        tenantId,
        created.id,
        { cron: snapshot.cron },
        changedBy,
      );
    }
    this.logger.log(`流程快照落地新建: ${created.id}（${snapshot.apiName}）`);
    return created.id;
  }
}
