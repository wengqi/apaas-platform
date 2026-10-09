/**
 * AI 生成质量聚合服务（ADR-0004 决策 5 / R5 主线）。
 *
 * 指标口径（与 ADR-0004 一致）：
 * - G3 首拦率：AI_GENERATION 事件流（被 G3 拒绝的提交不产生 ResourceVersion 行，
 *   只能从事件取），attempt = 单资源提交或批量提交中被实际校验的一项；
 * - 一次人审通过率：以 batchId 为单位（resource_versions.source='AI_MCP'，
 *   有 REJECTED 行的批次计为驳回批），分母 = 有终局（批准或驳回）的批次；
 * - 返工轮次：同一资源链（appId+module+apiName）上 REJECTED+SUPERSEDED 版本数
 *   相对 APPROVED 版本数的均值——每一次未获批准的提交计一轮返工。
 *
 * raw SQL 不经 prisma $extends 自动注入租户过滤，tenant_id 必须显式在 WHERE；
 * 数值列显式 ::int/::float8 转型（pg 驱动把 numeric 序列化为字符串）。
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@apaas/db';

export interface AiGenerationAnalytics {
  window: { appId: string | null; since: string | null; until: string | null };
  /** 提交尝试（G3 拦截率分母）：accepted + rejected */
  attempts: { total: number; accepted: number; rejected: number; blockRate: number };
  /** 按资源类型拆解（kind = ResourceVersion.module 值域） */
  byKind: Array<{ kind: string; accepted: number; rejected: number; blockRate: number }>;
  /** G3 拦截规则码分布（Top 10）——修方言指南的靶子 */
  topIssueCodes: Array<{ code: string; count: number }>;
  /** 批次人审结果（一次人审通过率） */
  batches: { verdictTotal: number; approved: number; rejected: number; firstPassRate: number };
  /** 返工轮次（每批准资源摊到的未批准版本数） */
  rework: { approvedVersions: number; reworkVersions: number; avgReworkPerApproved: number };
  byModule: Array<{ module: string; approved: number; rework: number }>;
}

const MAX_ISSUE_CODES = 10;

@Injectable()
export class AiAnalyticsService {
  async analytics(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date } = {},
  ): Promise<AiGenerationAnalytics> {
    const [byKindRows, issueCodeRows, batchRows, moduleRows] = await Promise.all([
      this.kindAttempts(tenantId, opts),
      this.topIssueCodes(tenantId, opts),
      this.batchVerdicts(tenantId, opts),
      this.moduleRework(tenantId, opts),
    ]);

    const accepted = byKindRows.reduce((sum, r) => sum + r.accepted, 0);
    const rejected = byKindRows.reduce((sum, r) => sum + r.rejected, 0);
    const attempts = accepted + rejected;

    const approvedBatches = batchRows.filter((b) => b.verdict === 'approved').length;
    const rejectedBatches = batchRows.filter((b) => b.verdict === 'rejected').length;
    const verdictBatches = approvedBatches + rejectedBatches;

    const approvedVersions = moduleRows.reduce((sum, r) => sum + r.approved, 0);
    const reworkVersions = moduleRows.reduce((sum, r) => sum + r.rework, 0);

    return {
      window: {
        appId: opts.appId ?? null,
        since: opts.since?.toISOString() ?? null,
        until: opts.until?.toISOString() ?? null,
      },
      attempts: {
        total: attempts,
        accepted,
        rejected,
        blockRate: rate(rejected, attempts),
      },
      byKind: byKindRows.map((r) => ({
        kind: r.kind,
        accepted: r.accepted,
        rejected: r.rejected,
        blockRate: rate(r.rejected, r.accepted + r.rejected),
      })),
      topIssueCodes: issueCodeRows,
      batches: {
        verdictTotal: verdictBatches,
        approved: approvedBatches,
        rejected: rejectedBatches,
        firstPassRate: rate(approvedBatches, verdictBatches),
      },
      rework: {
        approvedVersions,
        reworkVersions,
        avgReworkPerApproved: rate(reworkVersions, approvedVersions),
      },
      byModule: moduleRows,
    };
  }

  // ---------------------------------------------------------------------------
  // 查询（四路并行）
  // ---------------------------------------------------------------------------

  /** 提交尝试按资源类型拆解（事件流）。 */
  private async kindAttempts(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
  ): Promise<Array<{ kind: string; accepted: number; rejected: number }>> {
    const { where, params } = this.eventWhere(tenantId, opts);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ kind: string; accepted: number; rejected: number }>
    >(
      `SELECT COALESCE(detail->>'kind', 'UNKNOWN') AS kind,
              (COUNT(*) FILTER (WHERE source = 'mcp:submit-accepted'))::int AS accepted,
              (COUNT(*) FILTER (WHERE source = 'mcp:submit-rejected'))::int AS rejected
       FROM observability_events
       WHERE ${where} AND category = 'AI_GENERATION' AND source LIKE 'mcp:submit-%'
       GROUP BY 1 ORDER BY 1`,
      ...params,
    );
    return rows.map((r) => ({ ...r, accepted: Number(r.accepted), rejected: Number(r.rejected) }));
  }

  /** G3 拦截规则码分布（摊平 detail.issueCodes 数组取 Top N）。 */
  private async topIssueCodes(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
  ): Promise<Array<{ code: string; count: number }>> {
    const { where, params } = this.eventWhere(tenantId, opts, 'e.');
    const rows = await prisma.$queryRawUnsafe<Array<{ code: string; count: number }>>(
      `SELECT code, (COUNT(*))::int AS count
       FROM observability_events e, jsonb_array_elements_text(e.detail->'issueCodes') AS code
       WHERE ${where} AND e.category = 'AI_GENERATION' AND e.source = 'mcp:submit-rejected'
       GROUP BY code ORDER BY count DESC, code ASC LIMIT ${MAX_ISSUE_CODES}`,
      ...params,
    );
    return rows.map((r) => ({ code: r.code, count: Number(r.count) }));
  }

  /** 批次终局（resource_versions 链）：rejected 优先于 approved（部分成功语义）。 */
  private async batchVerdicts(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
  ): Promise<Array<{ verdict: 'approved' | 'rejected' | 'pending' }>> {
    const { where, params } = this.versionWhere(tenantId, opts);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ batch_id: string; approved: boolean; rejected: boolean }>
    >(
      `SELECT batch_id,
              BOOL_OR(status = 'APPROVED') AS approved,
              BOOL_OR(status = 'REJECTED') AS rejected
       FROM resource_versions
       WHERE ${where} AND source = 'AI_MCP' AND batch_id IS NOT NULL
       GROUP BY batch_id`,
      ...params,
    );
    return rows.map((r) => ({
      verdict: r.rejected ? 'rejected' : r.approved ? 'approved' : 'pending',
    }));
  }

  /** 返工轮次按资源链聚合（appId+module+apiName 链上未批准版本 vs 批准版本）。 */
  private async moduleRework(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
  ): Promise<Array<{ module: string; approved: number; rework: number }>> {
    const { where, params } = this.versionWhere(tenantId, opts);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ module: string; approved: number; rework: number }>
    >(
      `SELECT module,
              (COUNT(*) FILTER (WHERE status = 'APPROVED'))::int AS approved,
              (COUNT(*) FILTER (WHERE status IN ('REJECTED', 'SUPERSEDED')))::int AS rework
       FROM resource_versions
       WHERE ${where} AND source = 'AI_MCP'
       GROUP BY module ORDER BY module`,
      ...params,
    );
    return rows.map((r) => ({ ...r, approved: Number(r.approved), rework: Number(r.rework) }));
  }

  // ---------------------------------------------------------------------------
  // WHERE 构造（参数化，tenant_id 恒在；raw SQL 不经 $extends 注入）
  // ---------------------------------------------------------------------------

  private eventWhere(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
    prefix = '',
  ): { where: string; params: unknown[] } {
    return this.buildWhere(tenantId, opts, prefix);
  }

  private versionWhere(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
  ): { where: string; params: unknown[] } {
    return this.buildWhere(tenantId, opts, '');
  }

  private buildWhere(
    tenantId: string,
    opts: { appId?: string; since?: Date; until?: Date },
    prefix: string,
  ): { where: string; params: unknown[] } {
    const conds = [`${prefix}tenant_id = $1`];
    const params: unknown[] = [tenantId];
    if (opts.appId) {
      params.push(opts.appId);
      conds.push(`${prefix}app_id = $${params.length}`);
    }
    if (opts.since) {
      params.push(opts.since);
      conds.push(`${prefix}created_at >= $${params.length}`);
    }
    if (opts.until) {
      params.push(opts.until);
      conds.push(`${prefix}created_at <= $${params.length}`);
    }
    return { where: conds.join(' AND '), params };
  }
}

/** 比率（分母 0 保护），保留 4 位小数。 */
function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}
