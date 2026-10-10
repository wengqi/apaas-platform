/**
 * 观测事件 API（P1 运维治理）— 平台级观测中心取数。
 *
 * 分类/级别值域以 @apaas/shared/observability 为 SSOT，禁止本地硬编码。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type { EventCategory, EventLevel } from '@apaas/shared';

/** 观测事件 DTO（与 gateway ObservabilityService.query 返回项对齐）。 */
export interface ObservabilityEvent {
  id: string;
  category: EventCategory;
  level: EventLevel;
  source: string;
  appId: string | null;
  resourceId: string | null;
  durationMs: number | null;
  message: string;
  detail: unknown;
  traceId: string | null;
  createdAt: string;
}

export interface ObservabilityEventQueryResult {
  items: ObservabilityEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ObservabilityEventQueryParams {
  page?: number;
  pageSize?: number;
  category?: EventCategory;
  level?: EventLevel;
  appId?: string;
}

/** 分类汇总行（固定 5 分类全量返回，最近 24h）。 */
export interface ObservabilityCategorySummary {
  category: EventCategory;
  total: number;
  errors: number;
}

/** AI 生成质量聚合（ADR-0004 决策 5：与 gateway AiGenerationAnalytics 对齐）。 */
export interface AiGenerationAnalytics {
  window: { appId: string | null; since: string | null; until: string | null };
  attempts: { total: number; accepted: number; rejected: number; blockRate: number };
  byKind: Array<{ kind: string; accepted: number; rejected: number; blockRate: number }>;
  topIssueCodes: Array<{ code: string; count: number }>;
  batches: { verdictTotal: number; approved: number; rejected: number; firstPassRate: number };
  rework: { approvedVersions: number; reworkVersions: number; avgReworkPerApproved: number };
  byModule: Array<{ module: string; approved: number; rework: number }>;
}

const unwrap = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((res) => res.data.data as T);

export const observabilityApi = {
  /** 分类汇总（最近 24h 总数/错误数）。 */
  summary: (params: { appId?: string } = {}) =>
    unwrap<ObservabilityCategorySummary[]>(client.get('/api/observability/summary', { params })),

  /** 分页查询观测事件。 */
  events: (params: ObservabilityEventQueryParams = {}) =>
    unwrap<ObservabilityEventQueryResult>(client.get('/api/observability/events', { params })),

  /** AI 生成质量聚合（G3 首拦率/一次人审通过率/返工轮次）。 */
  aiAnalytics: (params: { appId?: string; since?: string; until?: string } = {}) =>
    unwrap<AiGenerationAnalytics>(client.get('/api/observability/ai-analytics', { params })),
};
