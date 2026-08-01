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
  list: () =>
    apiClient
      .get('/apps')
      .then((res) => res.data.data as AppSummary[]),
  get: (appId: string) =>
    apiClient
      .get(`/apps/${appId}`)
      .then((res) => res.data.data as AppSummary),
};
