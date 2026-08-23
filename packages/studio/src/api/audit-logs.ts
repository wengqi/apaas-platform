/**
 * 审计日志 API — 查询租户内权限操作审计记录。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';

export interface AuditLogItem {
  id: string;
  userId: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  detail: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogQueryResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogQueryParams {
  page?: number;
  pageSize?: number;
  action?: string;
  resource?: string;
  userId?: string;
}

const unwrap = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((res) => res.data.data as T);

export const auditLogsApi = {
  query: (params: AuditLogQueryParams = {}) =>
    unwrap<AuditLogQueryResult>(client.get('/api/audit-logs', { params })),
};
