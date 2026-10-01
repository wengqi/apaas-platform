/**
 * 审核服务（R1.2 版本模型 G1）——资源级 草稿→提交→发布 治理轨道。
 *
 * 状态机：提交 → PENDING（仅 AI，待人审）/ APPROVED（人工提交即时生效基线）
 *         PENDING → APPROVED（批准落活表）/ REJECTED（驳回）/ SUPERSEDED（同资源新提交取代）
 *
 * 治理不变量：
 * - AI（MCP）提交一律 PENDING，批准前不触碰活表（AI 仅产草稿）
 * - 人工提交即时 APPROVED 作为基线快照（历史版本链 / diff 基线 / 撤销未提交）
 * - 批准存在漂移保护：活表 ≠ 提交基线时拒绝，需 force 显式覆盖
 * - 批/驳全量审计 + 通知（待审→审核者；批/驳→提交者）
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type {
  ResourceDiff,
  ResourceSnapshot,
  ResourceVersionDetailDto,
  ResourceVersionDto,
  ResourceVersionListItemDto,
  DirtyResourceDto,
  ReviewModule,
} from '@apaas/shared';
import { diffResource, stableStringifyEqual } from '@apaas/shared';
import { InAppMessageService } from '../notification/in-app-message.service.js';
import { writeAudit } from '../common/audit.js';
import { LiveResource, ReviewSnapshotService } from './review-snapshot.service.js';

/** ResourceVersion 行（Prisma 生成模型） */
type ResourceVersionRow = {
  id: string;
  appId: string;
  module: string;
  entityId: string | null;
  apiName: string;
  name: string;
  versionNumber: number;
  snapshot: unknown;
  status: string;
  source: string;
  submittedBy: string;
  submittedVia: string;
  baselineVersionId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  createdAt: Date;
};

/** AI 提交入参（MCP 三工具经 G3 校验后的规范载荷） */
export interface AiDraftInput {
  module: ReviewModule;
  appId: string;
  apiName: string;
  name: string;
  snapshot: ResourceSnapshot;
  /** 更新已有资源时传入其活表 ID（省略则按 apiName 解析，解析不到视为新建） */
  entityId?: string;
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly snapshotService: ReviewSnapshotService,
    private readonly inAppMessage: InAppMessageService,
  ) {}

  // ===========================================================================
  // 提交
  // ===========================================================================

  /** 人工提交：固化活表当前态为 APPROVED 基线快照（即时生效，无自审环节）。 */
  async submitHuman(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    entityId: string,
    userId: string,
  ): Promise<ResourceVersionDto> {
    const live = await this.snapshotService.extractLive(tenantId, appId, module, entityId);
    if (!live) throw new NotFoundException('资源不存在');

    const row = await this.createVersion(tenantId, appId, {
      module,
      entityId: live.entityId,
      apiName: live.apiName,
      name: live.name,
      snapshot: live.snapshot,
      source: 'HUMAN',
      status: 'APPROVED',
      submittedBy: userId,
      submittedVia: 'studio',
    });

    writeAudit({
      tenantId,
      userId,
      action: 'REVIEW_SUBMIT',
      resource: module,
      resourceId: row.id,
      appId,
      detail: { channel: 'studio', apiName: live.apiName, versionNumber: row.versionNumber },
    });
    this.logger.log(`人工提交基线: ${module} ${live.apiName} v${row.versionNumber} by ${userId}`);
    return this.toDto(row, null);
  }

  /** AI 提交（MCP 专用）：G3 校验通过后进入 PENDING 待审队列，批准前不触碰活表。 */
  async submitAiDraft(
    tenantId: string,
    input: AiDraftInput,
    userId: string,
  ): Promise<ResourceVersionDto> {
    const { module, appId, apiName, name, snapshot } = input;

    // 目标解析：显式 entityId 优先，否则按 apiName 收编已有资源（更新语义）
    let entityId = input.entityId ?? null;
    if (entityId) {
      const live = await this.snapshotService.extractLive(tenantId, appId, module, entityId);
      if (!live) throw new NotFoundException('待更新的资源不存在');
    } else {
      const byApiName = await this.findByApiName(tenantId, appId, module, apiName);
      entityId = byApiName?.entityId ?? null;
    }

    // 同资源已有待审提交 → 被新提交取代（一个资源同时只挂一张待审单）
    await this.supersedePending(tenantId, appId, module, apiName);

    const row = await this.createVersion(tenantId, appId, {
      module,
      entityId,
      apiName,
      name,
      snapshot,
      source: 'AI_MCP',
      status: 'PENDING',
      submittedBy: userId,
      submittedVia: 'mcp',
    });

    await this.notifyReviewers(tenantId, appId, module, name, row.versionNumber);
    this.logger.log(`AI 提交待审: ${module} ${apiName} v${row.versionNumber} by ${userId}`);
    return this.toDto(row, null);
  }

  // ===========================================================================
  // 审批
  // ===========================================================================

  /** 批准：快照落活表（漂移保护：活表偏离提交基线时需 force）。 */
  async approve(
    tenantId: string,
    appId: string,
    submissionId: string,
    reviewerId: string,
    opts?: { comment?: string; force?: boolean },
  ): Promise<ResourceVersionDto> {
    const row = await this.getPendingOrThrow(tenantId, appId, submissionId);
    const snapshot = row.snapshot as unknown as ResourceSnapshot;
    const module = row.module as ReviewModule;

    if (row.entityId) {
      const live = await this.snapshotService.extractLive(tenantId, appId, module, row.entityId);
      const baseline = row.baselineVersionId
        ? await prisma.resourceVersion.findFirst({ where: { id: row.baselineVersionId, tenantId } })
        : null;
      // 漂移判定：活表当前态 ≠ 提交时的基线（期间存在未提交的人工修改）
      if (
        live &&
        baseline &&
        !stableStringifyEqual(live.snapshot, baseline.snapshot) &&
        !opts?.force
      ) {
        throw new BadRequestException(
          '活表状态已偏离提交基线（可能存在未提交的人工修改）。请先撤销未提交，或使用 force 强制覆盖。',
        );
      }
    }

    const appliedEntityId = await this.snapshotService.applySnapshot(
      tenantId,
      appId,
      module,
      snapshot,
      row.entityId,
      `review:${reviewerId}`,
    );

    const updated = await prisma.resourceVersion.update({
      where: { id: row.id },
      data: {
        status: 'APPROVED',
        entityId: appliedEntityId,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComment: opts?.comment ?? null,
      },
    });

    writeAudit({
      tenantId,
      userId: reviewerId,
      action: 'REVIEW_APPROVE',
      resource: module,
      resourceId: row.id,
      appId,
      detail: {
        apiName: row.apiName,
        source: row.source,
        versionNumber: row.versionNumber,
        forced: opts?.force === true,
      },
    });
    await this.notifySubmitter(
      tenantId,
      appId,
      row.submittedBy,
      `提交已批准：${row.name}`,
      `${module} 资源「${row.name}」v${row.versionNumber} 已批准生效。`,
    );
    return this.toDto(updated as ResourceVersionRow, null);
  }

  /** 驳回：意见必填，回传提交者（agent 自修正闭环的人类反馈入口）。 */
  async reject(
    tenantId: string,
    appId: string,
    submissionId: string,
    reviewerId: string,
    comment: string,
  ): Promise<ResourceVersionDto> {
    const row = await this.getPendingOrThrow(tenantId, appId, submissionId);

    const updated = await prisma.resourceVersion.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
    });

    writeAudit({
      tenantId,
      userId: reviewerId,
      action: 'REVIEW_REJECT',
      resource: row.module,
      resourceId: row.id,
      appId,
      detail: { apiName: row.apiName, source: row.source, comment },
    });
    await this.notifySubmitter(
      tenantId,
      appId,
      row.submittedBy,
      `提交被驳回：${row.name}`,
      `${row.module} 资源「${row.name}」v${row.versionNumber} 被驳回，意见：${comment}`,
    );
    return this.toDto(updated as ResourceVersionRow, null);
  }

  /** 撤销未提交：把最新 APPROVED 基线快照写回活表。 */
  async discardDraft(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    entityId: string,
    userId: string,
  ): Promise<{ reverted: boolean; apiName: string }> {
    const live = await this.snapshotService.extractLive(tenantId, appId, module, entityId);
    if (!live) throw new NotFoundException('资源不存在');

    const baseline = await this.latestApproved(tenantId, appId, module, live.apiName);
    if (!baseline) throw new BadRequestException('该资源尚无已批准基线，无法撤销');

    if (stableStringifyEqual(live.snapshot, baseline.snapshot)) {
      return { reverted: false, apiName: live.apiName };
    }

    await this.snapshotService.applySnapshot(
      tenantId,
      appId,
      module,
      baseline.snapshot as unknown as ResourceSnapshot,
      live.entityId,
      `discard:${userId}`,
    );
    writeAudit({
      tenantId,
      userId,
      action: 'REVIEW_DISCARD',
      resource: module,
      resourceId: entityId,
      appId,
      detail: { apiName: live.apiName, baselineVersion: baseline.versionNumber },
    });
    this.logger.log(`撤销未提交: ${module} ${live.apiName} → 基线 v${baseline.versionNumber}`);
    return { reverted: true, apiName: live.apiName };
  }

  // ===========================================================================
  // 查询
  // ===========================================================================

  /** 提交单列表；PENDING 单附 diff 摘要（快审列表口径），其余状态按需返回纯 DTO。 */
  async listSubmissions(
    tenantId: string,
    appId: string,
    filter?: { status?: string; module?: string },
  ): Promise<ResourceVersionListItemDto[]> {
    const where: Record<string, unknown> = { tenantId, appId };
    if (filter?.status) where['status'] = filter.status;
    if (filter?.module) where['module'] = filter.module;

    const rows = await prisma.resourceVersion.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    if (rows.length === 0) return [];

    // 批量取基线快照（PENDING 单的 diff 口径）
    const baselineIds = [
      ...new Set(rows.map((r) => r.baselineVersionId).filter(Boolean)),
    ] as string[];
    const baselines = baselineIds.length
      ? await prisma.resourceVersion.findMany({
          where: { id: { in: baselineIds }, tenantId },
          select: { id: true, snapshot: true },
        })
      : [];
    const baselineMap = new Map(baselines.map((b) => [b.id, b.snapshot]));

    return rows.map((row) =>
      this.toDto(
        row as ResourceVersionRow,
        row.status === 'PENDING'
          ? diffResource(
              row.module as ReviewModule,
              row.baselineVersionId ? (baselineMap.get(row.baselineVersionId) ?? null) : null,
              row.snapshot,
            )
          : null,
      ),
    );
  }

  /** 提交单详情（含快照与对基线的完整 diff）。 */
  async getSubmission(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<ResourceVersionDetailDto> {
    const row = (await prisma.resourceVersion.findFirst({
      where: { id: submissionId, tenantId, appId },
    })) as ResourceVersionRow | null;
    if (!row) throw new NotFoundException('提交单不存在');

    const baselineSnapshot = row.baselineVersionId
      ? ((
          await prisma.resourceVersion.findFirst({
            where: { id: row.baselineVersionId, tenantId },
            select: { snapshot: true },
          })
        )?.snapshot ?? null)
      : null;

    return {
      ...this.toDto(row, null),
      snapshot: row.snapshot as unknown as ResourceSnapshot,
      diff: diffResource(row.module as ReviewModule, baselineSnapshot, row.snapshot),
    };
  }

  /** 资源版本链（历史提交，按版本号正序）。 */
  async listResourceVersions(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    entityId: string,
  ): Promise<ResourceVersionDto[]> {
    // entityId 是活表 ID；链锚点是 apiName——先解析 apiName（活表优先，删除后退化到版本行）
    const live = await this.snapshotService.extractLive(tenantId, appId, module, entityId);
    let apiName = live?.apiName;
    if (!apiName) {
      const anyVersion = await prisma.resourceVersion.findFirst({
        where: { tenantId, appId, module, entityId },
        select: { apiName: true },
      });
      apiName = anyVersion?.apiName;
    }
    if (!apiName) return [];

    const rows = await prisma.resourceVersion.findMany({
      where: { tenantId, appId, module, apiName },
      orderBy: { versionNumber: 'asc' },
    });
    return rows.map((row) => this.toDto(row as ResourceVersionRow, null));
  }

  /**
   * 未提交变更清单（"已保存未提交"口径）：
   * - 有基线的资源：活表 ≠ 最新基线快照 → 漂移，可撤销
   * - 无基线的资源：从未提交 → baselineVersionNumber=null（人工提交基线的入口）
   */
  async listDirtyResources(tenantId: string, appId: string): Promise<DirtyResourceDto[]> {
    const modules: ReviewModule[] = ['OBJECT', 'PAGE', 'PROCESS'];
    const dirty: DirtyResourceDto[] = [];

    for (const module of modules) {
      const liveResources = await this.listLiveByModule(tenantId, appId, module);
      for (const resource of liveResources) {
        const baseline = await this.latestApproved(tenantId, appId, module, resource.apiName);
        if (!baseline) {
          dirty.push({
            module,
            entityId: resource.entityId,
            apiName: resource.apiName,
            name: resource.name,
            baselineVersionNumber: null,
          });
          continue;
        }
        if (!stableStringifyEqual(resource.snapshot, baseline.snapshot)) {
          dirty.push({
            module,
            entityId: resource.entityId,
            apiName: resource.apiName,
            name: resource.name,
            baselineVersionNumber: baseline.versionNumber,
          });
        }
      }
    }
    return dirty;
  }

  // ===========================================================================
  // 内部
  // ===========================================================================

  private async getPendingOrThrow(
    tenantId: string,
    appId: string,
    submissionId: string,
  ): Promise<ResourceVersionRow> {
    const row = (await prisma.resourceVersion.findFirst({
      where: { id: submissionId, tenantId, appId },
    })) as ResourceVersionRow | null;
    if (!row) throw new NotFoundException('提交单不存在');
    if (row.status !== 'PENDING') {
      throw new BadRequestException(`提交单已处理（${row.status}），不能重复审批`);
    }
    return row;
  }

  private async createVersion(
    tenantId: string,
    appId: string,
    input: {
      module: ReviewModule;
      entityId: string | null;
      apiName: string;
      name: string;
      snapshot: ResourceSnapshot;
      source: 'HUMAN' | 'AI_MCP';
      status: 'PENDING' | 'APPROVED';
      submittedBy: string;
      submittedVia: string;
    },
  ): Promise<ResourceVersionRow> {
    const baseline = await this.latestApproved(tenantId, appId, input.module, input.apiName);
    const agg = await prisma.resourceVersion.aggregate({
      where: { tenantId, appId, module: input.module, apiName: input.apiName },
      _max: { versionNumber: true },
    });
    const created = await prisma.resourceVersion.create({
      data: {
        tenantId,
        appId,
        module: input.module,
        entityId: input.entityId,
        apiName: input.apiName,
        name: input.name,
        versionNumber: (agg._max.versionNumber ?? 0) + 1,
        snapshot: input.snapshot as object,
        status: input.status,
        source: input.source,
        submittedBy: input.submittedBy,
        submittedVia: input.submittedVia,
        baselineVersionId: baseline?.id ?? null,
      },
    });
    return created as unknown as ResourceVersionRow;
  }

  private async supersedePending(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    apiName: string,
  ): Promise<void> {
    await prisma.resourceVersion.updateMany({
      where: { tenantId, appId, module, apiName, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });
  }

  private async latestApproved(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    apiName: string,
  ) {
    return prisma.resourceVersion.findFirst({
      where: { tenantId, appId, module, apiName, status: 'APPROVED' },
      orderBy: { versionNumber: 'desc' },
    });
  }

  private async findByApiName(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    apiName: string,
  ): Promise<LiveResource | null> {
    const idByModule: Record<ReviewModule, string | null> = {
      OBJECT:
        (
          await prisma.objectMeta.findFirst({
            where: { tenantId, appId, apiName },
            select: { id: true },
          })
        )?.id ?? null,
      PAGE:
        (
          await prisma.pageMeta.findFirst({
            where: { tenantId, appId, apiName },
            select: { id: true },
          })
        )?.id ?? null,
      PROCESS:
        (
          await prisma.processDef.findFirst({
            where: { tenantId, appId, apiName },
            select: { id: true },
          })
        )?.id ?? null,
    };
    const id = idByModule[module];
    return id ? this.snapshotService.extractLive(tenantId, appId, module, id) : null;
  }

  private async listLiveByModule(
    tenantId: string,
    appId: string,
    module: ReviewModule,
  ): Promise<LiveResource[]> {
    const resources: LiveResource[] = [];
    switch (module) {
      case 'OBJECT': {
        const rows = await prisma.objectMeta.findMany({ where: { tenantId, appId } });
        for (const row of rows) {
          resources.push({
            entityId: row.id,
            apiName: row.apiName,
            name: row.name,
            snapshot: {
              apiName: row.apiName,
              name: row.name,
              description: row.description ?? undefined,
              icon: row.icon ?? undefined,
              fields: Array.isArray(row.fields)
                ? (row.fields as Array<Record<string, unknown>>).filter(
                    (f) => f['isSystem'] !== true,
                  )
                : [],
            },
          });
        }
        break;
      }
      case 'PAGE': {
        const rows = await prisma.pageMeta.findMany({ where: { tenantId, appId } });
        for (const row of rows) {
          resources.push({
            entityId: row.id,
            apiName: row.apiName,
            name: row.name,
            snapshot: {
              apiName: row.apiName,
              name: row.name,
              type: row.type,
              objectId: row.objectId,
              schema: row.schema as Record<string, unknown>,
            },
          });
        }
        break;
      }
      case 'PROCESS': {
        const rows = await prisma.processDef.findMany({ where: { tenantId, appId } });
        for (const row of rows) {
          resources.push({
            entityId: row.id,
            apiName: row.apiName,
            name: row.name,
            snapshot: {
              apiName: row.apiName,
              name: row.name,
              workflowSchema: row.workflowSchema as Record<string, unknown>,
              triggerType: row.triggerType,
              cron: row.cron,
            },
          });
        }
        break;
      }
    }
    return resources;
  }

  /** 待审通知：租户管理员（TENANT_ADMIN）为 v1 审核者口径（与发布权限对齐）。 */
  private async notifyReviewers(
    tenantId: string,
    appId: string,
    module: ReviewModule,
    name: string,
    versionNumber: number,
  ): Promise<void> {
    try {
      const admins = await prisma.userRole.findMany({
        where: { role: { code: 'TENANT_ADMIN', tenantId } },
        select: { userId: true },
      });
      await this.inAppMessage.create({
        tenantId,
        appId,
        userIds: admins.map((a) => a.userId),
        title: `AI 草稿待审：${name}`,
        body: `${module} 资源「${name}」v${versionNumber} 已由 AI 提交，请在审核中心 diff 快审后批准或驳回。`,
      });
    } catch (err) {
      // 通知失败不阻塞提交主流程
      this.logger.warn(`待审通知发送失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 批/驳结果回传提交者。 */
  private async notifySubmitter(
    tenantId: string,
    appId: string,
    userId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      await this.inAppMessage.create({ tenantId, appId, userIds: [userId], title, body });
    } catch (err) {
      this.logger.warn(`审批结果通知失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private toDto(row: ResourceVersionRow, diff: ResourceDiff | null): ResourceVersionListItemDto {
    return {
      id: row.id,
      appId: row.appId,
      module: row.module as ReviewModule,
      entityId: row.entityId,
      apiName: row.apiName,
      name: row.name,
      versionNumber: row.versionNumber,
      status: row.status as ResourceVersionDto['status'],
      source: row.source as ResourceVersionDto['source'],
      submittedBy: row.submittedBy,
      submittedVia: row.submittedVia,
      baselineVersionId: row.baselineVersionId,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewComment: row.reviewComment,
      createdAt: row.createdAt.toISOString(),
      diff: diff ?? { changeCount: 0, summary: '', items: [] },
    };
  }
}
