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
  status: string;
  version: number;
  /** 资源统计（仅列表接口返回，详情接口不返回） */
  stats?: { objects: number; pages: number; processes: number };
  createdAt: string;
  updatedAt: string;
}

export const appsApi = {
  // runtime=1：服务端运行时视图——仅返回已发布且有权限的应用（2026-10-10）。
  // 客户端的 PUBLISHED 过滤保留为兜底；studio 端不传该参数，行为不变。
  list: () => apiClient.get('/apps?runtime=1').then((res) => res.data.data as AppSummary[]),
  get: (appId: string) =>
    apiClient.get(`/apps/${appId}`).then((res) => res.data.data as AppSummary),
};
