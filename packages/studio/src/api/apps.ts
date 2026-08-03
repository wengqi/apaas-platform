import client from './client.js';
import type { ApiResponse } from './client.js';

/**
 * 应用概要（列表页用，不含快照等重字段）。
 * 与后端 GET /api/apps 返回的 AppSummary 对齐。
 */
export interface AppSummary {
  id: string;
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  status: string;
  version: number;
  stats: { objects: number; pages: number; processes: number };
  createdAt: string;
  updatedAt: string;
}

/** 创建应用请求体。 */
export interface CreateAppRequest {
  apiName?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

/**
 * 应用 API 封装。
 *
 * 后端响应统一包裹为 { ok: true, data: ... }，
 * 这里取 res.data.data，直接返回业务数据。
 */
export const appsApi = {
  list: () =>
    client
      .get<ApiResponse<AppSummary[]>>('/api/apps')
      .then((res) => res.data.data as AppSummary[]),
  get: (appId: string) =>
    client
      .get<ApiResponse<AppSummary>>(`/api/apps/${appId}`)
      .then((res) => res.data.data as AppSummary),
  create: (data: CreateAppRequest) =>
    client
      .post<ApiResponse<AppSummary>>('/api/apps', data)
      .then((res) => res.data.data as AppSummary),
  update: (appId: string, data: Partial<CreateAppRequest>) =>
    client
      .put<ApiResponse<AppSummary>>(`/api/apps/${appId}`, data)
      .then((res) => res.data.data as AppSummary),
  delete: (appId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/apps/${appId}`)
      .then((res) => res.data.data as { deleted: boolean }),
  archive: (appId: string) =>
    client
      .post<ApiResponse<AppSummary>>(`/api/apps/${appId}/archive`)
      .then((res) => res.data.data as AppSummary),
};
