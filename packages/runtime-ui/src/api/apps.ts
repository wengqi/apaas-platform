/**
 * 应用 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的 /api/apps 端点。
 */

import apiClient from './client';

export interface AppSummary {
  id: string;
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** 应用分组（业务端只读；空=未分组） */
  group?: string;
  /** 维护者姓名（runtime 视图返回） */
  ownerName?: string;
  status: string;
  version: number;
  /** 资源统计（仅列表接口返回，详情接口不返回） */
  stats?: { objects: number; pages: number; processes: number };
  createdAt: string;
  updatedAt: string;
}

export const appsApi = {
  // 运行面 GET /apps（ADR-0005）：服务端只返回已发布且当前用户有权限的应用；
  // 搭建者全量列表在设计面 /design/apps，运行时不消费。客户端 PUBLISHED 过滤保留为兜底。
  list: () => apiClient.get('/apps').then((res) => res.data.data as AppSummary[]),
  // 运行面详情：未发布或无权限 → 404（运行时视角应用尚不存在）
  get: (appId: string) =>
    apiClient.get(`/apps/${appId}`).then((res) => res.data.data as AppSummary),
};
