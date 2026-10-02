/**
 * 页面 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的 /api/apps/:appId/pages 和 /api/pages 端点。
 * 类型从 studio api/pages.ts 精简复制（仅运行时所需）。
 */

import apiClient from './client';
export type PageType = 'list_page' | 'detail_page' | 'form_page' | 'dashboard' | 'custom';

/**
 * 页面 Schema —— amis 方言（唯一方言，ADR-0003），形状由 G3 校验合同约束。
 */
export type PageSchema = Record<string, unknown>;

export interface PageMeta {
  id: string;
  tenantId?: string;
  appId: string;
  name: string;
  /** 页面路径标识（后端 Prisma apiName 映射为 slug 返回） */
  slug: string;
  type: PageType;
  objectId?: string;
  schema: PageSchema;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const pagesApi = {
  /** 列出应用下已发布页面 */
  list: (appId: string) =>
    apiClient.get(`/apps/${appId}/pages`).then((res) => res.data.data as PageMeta[]),

  /** 按 slug 获取已发布页面（运行时渲染用） */
  getBySlug: (appId: string, slug: string, env?: string) =>
    apiClient
      .get(`/apps/${appId}/pages/slug/${slug}`, { params: env ? { env } : undefined })
      .then((res) => res.data.data as PageMeta),

  /** R1.4：按 ID 读运行时页面（审批页渲染，环境 bundle 优先） */
  getRuntime: (appId: string, pageId: string, env?: string) =>
    apiClient
      .get(`/apps/${appId}/pages/runtime/${pageId}`, { params: env ? { env } : undefined })
      .then((res) => res.data.data as PageMeta),
};
