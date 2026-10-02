/**
 * 流程效率分析服务（P1 运维治理）— 平均耗时 / 完成率 / 超时数。
 *
 * 数据口径：
 * - 计数按状态 groupBy（RUNNING/WAITING_USER_TASK 为在途，其余为已终态）
 * - 完成率 = COMPLETED / 已终态（COMPLETED+FAILED+TERMINATED）；无终态实例时为 null
 * - 耗时 = finished_at - started_at（仅终态实例）；超 SQL 聚合（AVG/MAX），GROUP BY 支持按流程拆分
 * - 超时数 = timedOut 标记（引擎等待条件节点超时置位，见 process-engine 等待条件检查）
 *
 * 注意：本服务使用 $queryRaw 聚合（Prisma groupBy 无法跨列平均），须显式带上
 * tenant_id 与 environment_id 过滤（raw SQL 不经 $extends 自动注入）；环境取
 * ALS 上下文（缺省 prod），与 count/groupBy 的自动注入口径一致。
 */

import { Injectable } from '@nestjs/common';
import { prisma, getEnvironmentId } from '@apaas/db';

export interface ProcessAnalyticsParams {
  tenantId: string;
  appId?: string;
  processDefId?: string;
  since?: Date;
  until?: Date;
}

export interface ProcessTotals {
  total: number;
  running: number;
  waitingUserTask: number;
  completed: number;
  failed: number;
  terminated: number;
  timedOut: number;
  /** COMPLETED / 终态数；无终态实例时 null */
  completionRate: number | null;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
}

export interface ProcessDefAnalytics {
  processDefId: string;
  name: string;
  apiName: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  timedOut: number;
  completionRate: number | null;
  avgDurationMs: number | null;
}

export interface ProcessAnalyticsResult {
  totals: ProcessTotals;
  byProcess: ProcessDefAnalytics[];
}

/** 终态状态集合（完成率分母）。 */
const FINISHED_STATUSES = ['COMPLETED', 'FAILED', 'TERMINATED'] as const;

interface DurationRow {
  processDefId: string;
  avgDurationMs: number | null;
}

@Injectable()
export class ProcessAnalyticsService {
  async getAnalytics(params: ProcessAnalyticsParams): Promise<ProcessAnalyticsResult> {
    const { tenantId } = params;
    const environmentId = getEnvironmentId() ?? 'prod';

    // 解析统计范围：appId → 该应用全部流程；processDefId → 单流程；都缺 → 租户全部
    const defs = await prisma.processDef.findMany({
      where: {
        tenantId,
        ...(params.appId ? { appId: params.appId } : {}),
        ...(params.processDefId ? { id: params.processDefId } : {}),
      },
      select: { id: true, name: true, apiName: true },
    });
    const defIds = defs.map((d) => d.id);

    const empty: ProcessAnalyticsResult = {
      totals: this.emptyTotals(),
      byProcess: [],
    };
    if (defIds.length === 0) return empty;

    const timeRange = {
      ...(params.since ? { gte: params.since } : {}),
      ...(params.until ? { lte: params.until } : {}),
    };
    const instanceWhere = {
      tenantId,
      processDefId: { in: defIds },
      ...(Object.keys(timeRange).length > 0 ? { startedAt: timeRange } : {}),
    };

    const [statusGroups, timedOutGroups, durationRows, overall] = await Promise.all([
      prisma.processInstance.groupBy({
        by: ['processDefId', 'status'],
        where: instanceWhere,
        _count: { _all: true },
      }),
      prisma.processInstance.groupBy({
        by: ['processDefId'],
        where: { ...instanceWhere, timedOut: true },
        _count: { _all: true },
      }),
      this.queryDurations(tenantId, environmentId, defIds, params),
      this.queryOverallDuration(tenantId, environmentId, defIds, params),
    ]);
    const timedOutCount = timedOutGroups.reduce((sum, g) => sum + g._count._all, 0);
    const timedOutByDef = new Map(timedOutGroups.map((g) => [g.processDefId, g._count._all]));

    // 透视 (processDefId, status) → 计数
    const perDef = new Map<string, Map<string, number>>();
    const totalsByStatus = new Map<string, number>();
    let grandTotal = 0;
    for (const g of statusGroups) {
      const count = g._count._all;
      grandTotal += count;
      totalsByStatus.set(g.status, (totalsByStatus.get(g.status) ?? 0) + count);
      const bucket = perDef.get(g.processDefId) ?? new Map<string, number>();
      bucket.set(g.status, count);
      perDef.set(g.processDefId, bucket);
    }
    const durationByDef = new Map(durationRows.map((r) => [r.processDefId, r]));

    const byProcess: ProcessDefAnalytics[] = defs
      .map((d) => {
        const bucket = perDef.get(d.id) ?? new Map<string, number>();
        const count = (status: string) => bucket.get(status) ?? 0;
        const finished = count('COMPLETED') + count('FAILED') + count('TERMINATED');
        return {
          processDefId: d.id,
          name: d.name,
          apiName: d.apiName,
          total: [...bucket.values()].reduce((sum, n) => sum + n, 0),
          completed: count('COMPLETED'),
          failed: count('FAILED'),
          running: count('RUNNING') + count('WAITING_USER_TASK'),
          timedOut: timedOutByDef.get(d.id) ?? 0,
          completionRate: finished > 0 ? count('COMPLETED') / finished : null,
          avgDurationMs: durationByDef.get(d.id)?.avgDurationMs ?? null,
        };
      })
      // 有流程维度的界面只关心跑过的流程；从未运行的不占版面
      .filter((row) => row.total > 0);

    const totalFinished = FINISHED_STATUSES.reduce(
      (sum, s) => sum + (totalsByStatus.get(s) ?? 0),
      0,
    );
    const completedTotal = totalsByStatus.get('COMPLETED') ?? 0;

    return {
      totals: {
        total: grandTotal,
        running:
          (totalsByStatus.get('RUNNING') ?? 0) + (totalsByStatus.get('WAITING_USER_TASK') ?? 0),
        waitingUserTask: totalsByStatus.get('WAITING_USER_TASK') ?? 0,
        completed: completedTotal,
        failed: totalsByStatus.get('FAILED') ?? 0,
        terminated: totalsByStatus.get('TERMINATED') ?? 0,
        timedOut: timedOutCount,
        completionRate: totalFinished > 0 ? completedTotal / totalFinished : null,
        avgDurationMs: overall?.avgDurationMs ?? null,
        maxDurationMs: overall?.maxDurationMs ?? null,
      },
      byProcess,
    };
  }

  private emptyTotals(): ProcessTotals {
    return {
      total: 0,
      running: 0,
      waitingUserTask: 0,
      completed: 0,
      failed: 0,
      terminated: 0,
      timedOut: 0,
      completionRate: null,
      avgDurationMs: null,
      maxDurationMs: null,
    };
  }

  /**
   * 按流程聚合耗时（终态实例）。$queryRawUnsafe + 位置参数（参数化，无注入面），
   * 与 G5 数据下沉的 raw SQL 路径同口径；显式 tenant/environment 过滤（raw 不经 $extends）。
   */
  private async queryDurations(
    tenantId: string,
    environmentId: string,
    defIds: string[],
    params: ProcessAnalyticsParams,
  ): Promise<DurationRow[]> {
    const { sql, values } = buildDurationSql(tenantId, environmentId, defIds, params, true);
    return prisma.$queryRawUnsafe<DurationRow[]>(sql, ...values);
  }

  /** 全局耗时汇总（AVG + MAX，终态实例）。 */
  private async queryOverallDuration(
    tenantId: string,
    environmentId: string,
    defIds: string[],
    params: ProcessAnalyticsParams,
  ): Promise<{ avgDurationMs: number | null; maxDurationMs: number | null } | null> {
    const { sql, values } = buildDurationSql(tenantId, environmentId, defIds, params, false);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ avgDurationMs: number | null; maxDurationMs: number | null }>
    >(sql, ...values);
    return rows[0] ?? null;
  }
}

/**
 * 构建耗时聚合 SQL（参数化位置占位 $1..$n）。
 * groupByDef=true 按 process_def_id 分组；false 全局单行（AVG + MAX）。
 */
function buildDurationSql(
  tenantId: string,
  environmentId: string,
  defIds: string[],
  params: ProcessAnalyticsParams,
  groupByDef: boolean,
): { sql: string; values: unknown[] } {
  const values: unknown[] = [tenantId, environmentId, defIds];
  const durationExpr = 'EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000';
  // ::float8：EXTRACT/AVG 返回 numeric，pg 驱动把 numeric 序列化为字符串——
  // 转 double precision 保证 JS 侧拿到 number（DTO 合同）
  const selectParts = groupByDef
    ? ['process_def_id AS "processDefId"', `AVG(${durationExpr})::float8 AS "avgDurationMs"`]
    : [
        `AVG(${durationExpr})::float8 AS "avgDurationMs"`,
        `MAX(${durationExpr})::float8 AS "maxDurationMs"`,
      ];
  // ANY($3) 数组参数等价 IN 列表（defIds 已按租户解析）
  const sql = `
    SELECT ${selectParts.join(', ')}
    FROM process_instances
    WHERE tenant_id = $1
      AND environment_id = $2
      AND finished_at IS NOT NULL
      AND process_def_id = ANY($3::text[])
      ${params.since !== undefined ? `AND started_at >= $${values.push(params.since)}` : ''}
      ${params.until !== undefined ? `AND started_at <= $${values.push(params.until)}` : ''}
    ${groupByDef ? 'GROUP BY process_def_id' : ''}
  `;
  return { sql, values };
}
