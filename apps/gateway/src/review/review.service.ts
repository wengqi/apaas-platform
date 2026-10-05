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
import { ReviewCallbackService, type ReviewCallbackEvent } from './review-callback.service.js';

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
  batchId: string | null;
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
  /** 批量提交组 ID（submit_app_drafts 单波生成完整应用时共享） */
  batchId?: string;
}

// ---------------------------------------------------------------------------
// 批量引用令牌（跨资源依赖在批准前的占位协议）
// ---------------------------------------------------------------------------

/** 令牌形如 "@ref:object:meeting_room" / "@ref:page:approval_form"。 */
export const REF_TOKEN_RE = /^@ref:(object|dataset|page):([a-z][a-z0-9_]*)$/;

/** 深度收集 value 中所有引用令牌（纯函数，供单测）。 */
export function collectRefTokens(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (REF_TOKEN_RE.test(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefTokens(item, out);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectRefTokens(item, out);
  }
  return out;
}

/** 用 map 替换 value 中的引用令牌（纯函数，map 未覆盖的令牌原样保留，供单测）。 */
export function replaceRefTokens<T>(value: T, map: Map<string, string>): T {
  if (typeof value === 'string') {
    return (map.get(value) ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceRefTokens(item, map)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceRefTokens(v, map);
    return out as T;
  }
  return value;
}

/** 批量落地顺序：对象 → 页面 → 流程（页面引用对象，流程引用页面）。 */
const MODULE_APPLY_ORDER: Record<string, number> = { OBJECT: 0, DATASET: 1, PAGE: 2, PROCESS: 3 };

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly snapshotService: ReviewSnapshotService,
    private readonly inAppMessage: InAppMessageService,
    private readonly callbackService: ReviewCallbackService,
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
      batchId: input.batchId ?? null,
    });

    await this.notifyReviewers(tenantId, appId, module, name, row.versionNumber);
    this.logger.log(`AI 提交待审: ${module} ${apiName} v${row.versionNumber} by ${userId}`);
    return this.toDto(row, null);
  }

  /**
   * AI 批量提交（submit_app_drafts 单波生成完整应用）：同一 batchId 下
   * 创建全部资源提交单，一次人审整批处置。跨资源引用以令牌占位
   * （"@ref:object:x" / "@ref:page:x"），批量批准时按拓扑序解析落地。
   */
  async submitAiBatch(
    tenantId: string,
    input: { appId: string; items: AiDraftInput[] },
    userId: string,
  ): Promise<{ batchId: string; rows: ResourceVersionDto[] }> {
    if (input.items.length === 0) throw new BadRequestException('批量提交至少包含一项资源');
    const batchId = crypto.randomUUID();

    const rows: ResourceVersionDto[] = [];
    for (const item of input.items) {
      await this.supersedePending(tenantId, input.appId, item.module, item.apiName);
      const row = await this.createVersion(tenantId, input.appId, {
        module: item.module,
        entityId: item.entityId ?? null,
        apiName: item.apiName,
        name: item.name,
        snapshot: item.snapshot,
        source: 'AI_MCP',
        status: 'PENDING',
        submittedBy: userId,
        submittedVia: 'mcp',
        batchId,
      });
      rows.push(this.toDto(row, null));
    }

    const moduleCount = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.module] = (acc[r.module] ?? 0) + 1;
      return acc;
    }, {});
    writeAudit({
      tenantId,
      userId,
      action: 'REVIEW_SUBMIT',
      resource: 'APPLICATION',
      resourceId: batchId,
      appId: input.appId,
      detail: { channel: 'mcp', batch: true, moduleCount, count: rows.length },
    });
    await this.notifyReviewers(
      tenantId,
      input.appId,
      'APPLICATION',
      `AI 批量提交（${rows.length} 项资源）`,
      1,
    );
    this.logger.log(
      `AI 批量提交待审: batch=${batchId} ×${rows.length}（${JSON.stringify(moduleCount)}）by ${userId}`,
    );
    return { batchId, rows };
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
    const updated = await this.applyApproved(tenantId, appId, row, reviewerId, opts);
    await this.notifySubmitter(
      tenantId,
      appId,
      row.submittedBy,
      `提交已批准：${row.name}`,
      `${row.module} 资源「${row.name}」v${row.versionNumber} 已批准生效。`,
    );
    await this.emitCallback(tenantId, appId, {
      event: 'review.approved',
      batchId: row.batchId,
      submissionId: row.id,
      module: row.module,
      apiName: row.apiName,
      status: 'APPROVED',
      reviewComment: opts?.comment ?? null,
      reviewedBy: reviewerId,
    });
    return updated;
  }

  /** 组装并发送审批结果出站回调（未配置 REVIEW_CALLBACK_URL 时静默跳过）。 */
  private async emitCallback(
    tenantId: string,
    appId: string,
    partial: Omit<ReviewCallbackEvent, 'tenantId' | 'appId' | 'timestamp'>,
  ): Promise<void> {
    await this.callbackService.notify({
      ...partial,
      tenantId,
      appId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 批量批准：按 对象→页面→流程 拓扑序落地，落地前解析批量引用令牌
   * （页面 objectId 的 "@ref:object:x" / 流程 pageId 的 "@ref:page:x"）。
   * 中途失败时已落地项保持 APPROVED（部分成功语义，错误信息含资源名）。
   */
  async approveBatch(
    tenantId: string,
    appId: string,
    batchId: string,
    reviewerId: string,
    opts?: { comment?: string; force?: boolean },
  ): Promise<ResourceVersionDto[]> {
    const rows = (await prisma.resourceVersion.findMany({
      where: { tenantId, appId, batchId, status: 'PENDING' },
    })) as ResourceVersionRow[];
    if (rows.length === 0) {
      throw new BadRequestException('批次不存在或已全部处理');
    }
    rows.sort((a, b) => (MODULE_APPLY_ORDER[a.module] ?? 9) - (MODULE_APPLY_ORDER[b.module] ?? 9));

    const applied: ResourceVersionDto[] = [];
    for (const row of rows) {
      try {
        const snapshot = { ...((row.snapshot as Record<string, unknown>) ?? {}) };
        if (row.module === 'PAGE' && typeof snapshot['objectId'] === 'string') {
          snapshot['objectId'] = await this.resolveObjectRef(tenantId, appId, snapshot['objectId']);
        }
        if (row.module === 'PROCESS') {
          const tokens = collectRefTokens(snapshot['workflowSchema']);
          if (tokens.size > 0) {
            const map = new Map<string, string>();
            for (const token of tokens) {
              map.set(token, await this.resolvePageToken(tenantId, appId, token));
            }
            snapshot['workflowSchema'] = replaceRefTokens(snapshot['workflowSchema'], map);
          }
        }
        applied.push(
          await this.applyApproved(
            tenantId,
            appId,
            { ...row, snapshot: snapshot as unknown as ResourceSnapshot },
            reviewerId,
            opts,
          ),
        );
      } catch (err) {
        const done = applied.length;
        throw new BadRequestException(
          `批量批准在第 ${done + 1} 项（${row.module} ${row.apiName}）失败：` +
            `${err instanceof Error ? err.message : String(err)}。` +
            `此前 ${done} 项已落地生效。`,
        );
      }
    }

    writeAudit({
      tenantId,
      userId: reviewerId,
      action: 'REVIEW_APPROVE',
      resource: 'APPLICATION',
      resourceId: batchId,
      appId,
      detail: { batch: true, approvedCount: applied.length, apiNames: rows.map((r) => r.apiName) },
    });
    const first = rows[0]!;
    await this.notifySubmitter(
      tenantId,
      appId,
      first.submittedBy,
      `批量提交已批准（${applied.length} 项）`,
      `应用资源批量提交（${rows.map((r) => r.name).join('、')}）已全部批准生效。`,
    );
    await this.emitCallback(tenantId, appId, {
      event: 'review.approved',
      batchId,
      submissionId: null,
      module: 'APPLICATION',
      apiName: `batch:${applied.map((r) => r.apiName).join(',')}`,
      status: 'APPROVED',
      reviewComment: opts?.comment ?? null,
      reviewedBy: reviewerId,
    });
    this.logger.log(`批量批准: batch=${batchId} ×${applied.length} by ${reviewerId}`);
    return applied;
  }

  /** 批量驳回：批次内全部 PENDING 单统一驳回（级联，防半批落地的悬挂引用）。 */
  async rejectBatch(
    tenantId: string,
    appId: string,
    batchId: string,
    reviewerId: string,
    comment: string,
  ): Promise<{ rejected: number }> {
    const rows = (await prisma.resourceVersion.findMany({
      where: { tenantId, appId, batchId, status: 'PENDING' },
      select: { id: true, submittedBy: true, name: true },
    })) as Array<{ id: string; submittedBy: string; name: string }>;
    if (rows.length === 0) throw new BadRequestException('批次不存在或已全部处理');

    const res = await prisma.resourceVersion.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, status: 'PENDING' },
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
      resource: 'APPLICATION',
      resourceId: batchId,
      appId,
      detail: { batch: true, rejectedCount: res.count, comment },
    });
    const first = rows[0]!;
    await this.notifySubmitter(
      tenantId,
      appId,
      first.submittedBy,
      `批量提交已驳回（${res.count} 项）`,
      `驳回意见：${comment}`,
    );
    await this.emitCallback(tenantId, appId, {
      event: 'review.rejected',
      batchId,
      submissionId: null,
      module: 'APPLICATION',
      apiName: `batch:${res.count} rejected`,
      status: 'REJECTED',
      reviewComment: comment,
      reviewedBy: reviewerId,
    });
    this.logger.log(`批量驳回: batch=${batchId} ×${res.count} by ${reviewerId}`);
    return { rejected: res.count };
  }

  /** 单项批准的共用落地（漂移保护 + 快照落活表 + 版本态更新 + 审计）。 */
  private async applyApproved(
    tenantId: string,
    appId: string,
    row: ResourceVersionRow,
    reviewerId: string,
    opts?: { comment?: string; force?: boolean },
  ): Promise<ResourceVersionDto> {
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

    // 基线归一化（实测缺陷 2026-10-05）：落地时解析了 @ref: 令牌（活表存真实 ID），
    // 若基线快照保留令牌形态，同资源二次 AI 提交的漂移检查必然误报
    // （活表真实 ID ≠ 基线令牌）。基线必须等于落地形态：重新提取活表回写快照。
    try {
      const applied = await this.snapshotService.extractLive(
        tenantId,
        appId,
        module,
        appliedEntityId,
      );
      if (applied) {
        await prisma.resourceVersion.update({
          where: { id: row.id },
          data: { snapshot: applied.snapshot as object },
        });
        row.snapshot = applied.snapshot as ResourceVersionRow['snapshot'];
      }
    } catch (err) {
      this.logger.warn(`基线归一化失败（不影响批准结果）: ${row.id} ${(err as Error).message}`);
    }

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
    await this.emitCallback(tenantId, appId, {
      event: 'review.rejected',
      batchId: row.batchId,
      submissionId: row.id,
      module: row.module,
      apiName: row.apiName,
      status: 'REJECTED',
      reviewComment: comment,
      reviewedBy: reviewerId,
    });
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

  /** 页面快照 objectId 的令牌解析（"@ref:object:x" → 活表对象 ID；非令牌原样返回）。 */
  private async resolveObjectRef(
    tenantId: string,
    appId: string,
    objectId: string,
  ): Promise<string> {
    const m = /^@ref:object:([a-z][a-z0-9_]*)$/.exec(objectId);
    if (!m) return objectId;
    const obj = await prisma.objectMeta.findFirst({
      where: { tenantId, appId, apiName: m[1] },
      select: { id: true },
    });
    if (!obj) {
      throw new NotFoundException(`批量引用的对象「${m[1]}」尚未落地（拓扑序或引用配置有误）`);
    }
    return obj.id;
  }

  /** 流程 schema 中 "@ref:page:x" 令牌 → 活表页面 ID。 */
  private async resolvePageToken(tenantId: string, appId: string, token: string): Promise<string> {
    const m = /^@ref:page:([a-z][a-z0-9_]*)$/.exec(token);
    if (!m) return token;
    const page = await prisma.pageMeta.findFirst({
      where: { tenantId, appId, apiName: m[1] },
      select: { id: true },
    });
    if (!page) {
      throw new NotFoundException(`批量引用的页面「${m[1]}」尚未落地（拓扑序或引用配置有误）`);
    }
    return page.id;
  }

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
      batchId?: string | null;
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
        batchId: input.batchId ?? null,
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
      DATASET:
        (
          await prisma.dataFlow.findFirst({
            where: { tenantId, appId, apiName },
            select: { id: true },
          })
        )?.id ?? null,
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
    module: ReviewModule | 'APPLICATION',
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
      batchId: row.batchId ?? null,
      createdAt: row.createdAt.toISOString(),
      diff: diff ?? { changeCount: 0, summary: '', items: [] },
    };
  }
}
