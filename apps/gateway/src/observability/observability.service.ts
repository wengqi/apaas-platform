/**
 * 观测事件服务（P1 运维治理）— 分类事件流的落库/查询/汇总。
 *
 * 写入设计为非阻塞（与审计日志同口径）：失败仅记 error 日志，不影响主操作。
 * traceId / environmentId 在请求 ALS 上下文内自动采纳，调用方无需显式传递。
 *
 * 分类 SSOT：packages/shared/src/observability（EVENT_CATEGORIES），落库前校验。
 */

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { prisma, getEnvironmentId, getTenantId, onSlowQuery } from '@apaas/db';
import { EVENT_CATEGORIES, EVENT_LEVELS, type EventCategory, type EventLevel } from '@apaas/shared';
import { getTraceId } from '../common/trace/trace-context.js';

export interface RecordEventParams {
  tenantId: string;
  category: EventCategory;
  /** 来源签名，如 cloud-function:invoke / prisma:slow-query / runtime-ui:error-boundary */
  source: string;
  message: string;
  level?: EventLevel;
  appId?: string | null;
  resourceId?: string | null;
  durationMs?: number | null;
  detail?: Record<string, unknown>;
}

export interface EventQueryParams {
  tenantId: string;
  page: number;
  pageSize: number;
  category?: EventCategory;
  level?: EventLevel;
  appId?: string;
  since?: Date;
  until?: Date;
}

export interface ObservabilityEventDto {
  id: string;
  category: string;
  level: string;
  source: string;
  appId: string | null;
  resourceId: string | null;
  durationMs: number | null;
  message: string;
  detail: unknown;
  traceId: string | null;
  createdAt: string;
}

export interface CategorySummary {
  category: string;
  total: number;
  errors: number;
}

/** 汇总统计窗口（最近 24 小时）。 */
const SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 慢查询事件级别。 */
const SLOW_QUERY_LEVEL: EventLevel = 'WARN';
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ObservabilityService implements OnModuleDestroy {
  private readonly logger = new Logger(ObservabilityService.name);
  private unsubscribeSlowQuery: (() => void) | null = null;

  /** 启动时注册慢查询 handler（db 包测量，本服务落库）。 */
  onModuleInit(): void {
    this.unsubscribeSlowQuery = onSlowQuery((info) => {
      const tenantId = getTenantId();
      if (!tenantId) return; // 无租户上下文（启动期/系统任务）不落事件
      void this.record({
        tenantId,
        category: 'SLOW_QUERY',
        level: SLOW_QUERY_LEVEL,
        source: 'prisma:slow-query',
        message: `${info.model}.${info.operation} 耗时 ${Math.round(info.durationMs)}ms`,
        durationMs: Math.round(info.durationMs),
      });
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeSlowQuery?.();
  }

  /**
   * 记录一条观测事件。非阻塞：内部吞没异常，调用方无需 await。
   * 分类/级别按 shared SSOT 白名单校验，非法值丢弃（防脏分类入库）。
   */
  async record(params: RecordEventParams): Promise<void> {
    if (!(EVENT_CATEGORIES as readonly string[]).includes(params.category)) {
      this.logger.warn(`未知观测事件分类，已丢弃: ${params.category}`);
      return;
    }
    const level = params.level ?? 'INFO';
    try {
      await prisma.observabilityEvent.create({
        data: {
          tenantId: params.tenantId,
          // 请求 ALS 上下文内的环境（页面报错/开放 API 调用随请求）；缺省 prod
          environmentId: getEnvironmentId() ?? 'prod',
          appId: params.appId ?? null,
          category: params.category,
          level: (EVENT_LEVELS as readonly string[]).includes(level) ? level : 'INFO',
          source: params.source,
          resourceId: params.resourceId ?? null,
          durationMs: params.durationMs ?? null,
          message: params.message,
          detail: (params.detail ?? {}) as never,
          traceId: getTraceId(),
        },
      });
    } catch (err) {
      this.logger.error(`观测事件写入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 分页查询观测事件（支持分类/级别/应用/时间窗筛选）。 */
  async query(params: EventQueryParams): Promise<{
    items: ObservabilityEventDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const pageSize = Math.min(params.pageSize, MAX_PAGE_SIZE);
    const where: Record<string, unknown> = { tenantId: params.tenantId };
    if (params.category) where.category = params.category;
    if (params.level) where.level = params.level;
    if (params.appId) where.appId = params.appId;
    if (params.since || params.until) {
      where.createdAt = {
        ...(params.since ? { gte: params.since } : {}),
        ...(params.until ? { lte: params.until } : {}),
      };
    }

    const [items, total] = await Promise.all([
      prisma.observabilityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.observabilityEvent.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toDto(item)),
      total,
      page: params.page,
      pageSize,
    };
  }

  /** 分类汇总（最近 24h：总数 + 错误数，观测中心顶部卡片）。 */
  async summary(tenantId: string, appId?: string): Promise<CategorySummary[]> {
    const since = new Date(Date.now() - SUMMARY_WINDOW_MS);
    const baseWhere: Record<string, unknown> = { tenantId, createdAt: { gte: since } };
    if (appId) baseWhere.appId = appId;

    const [totals, errors] = await Promise.all([
      prisma.observabilityEvent.groupBy({
        by: ['category'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.observabilityEvent.groupBy({
        by: ['category'],
        where: { ...baseWhere, level: 'ERROR' },
        _count: { _all: true },
      }),
    ]);

    const errorMap = new Map(errors.map((e) => [e.category, e._count._all]));
    return EVENT_CATEGORIES.map((category) => ({
      category,
      total: totals.find((t) => t.category === category)?._count._all ?? 0,
      errors: errorMap.get(category) ?? 0,
    }));
  }

  private toDto(item: {
    id: string;
    category: string;
    level: string;
    source: string;
    appId: string | null;
    resourceId: string | null;
    durationMs: number | null;
    message: string;
    detail: unknown;
    traceId: string | null;
    createdAt: Date;
  }): ObservabilityEventDto {
    return {
      id: item.id,
      category: item.category,
      level: item.level,
      source: item.source,
      appId: item.appId,
      resourceId: item.resourceId,
      durationMs: item.durationMs,
      message: item.message,
      detail: item.detail,
      traceId: item.traceId,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
