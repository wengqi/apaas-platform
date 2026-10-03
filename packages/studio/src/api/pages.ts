import client from './client.js';
import type { ApiResponse } from './client.js';

/**
 * 页面搭建器 API 封装。
 *
 * 类型契约对齐 packages/shared/src/page/index.ts(SSOT),
 * 但 Studio 不直接依赖 @apaas/shared,这里以接口形式重新声明,
 * ID 统一用 string(运行时与品牌 ID 同为 string),便于前端直接使用。
 *
 * 后端响应统一包裹为 { ok: true, data: ... },取 res.data.data。
 */

// ---------------------------------------------------------------------------
// 枚举(字符串字面量联合,对齐 shared ComponentType/PageType/ActionType/VariableType)
// ---------------------------------------------------------------------------

/** 组件类型枚举(对标飞书 aPaaS 组件库)。 */
export type PageType = 'list_page' | 'detail_page' | 'form_page' | 'dashboard' | 'custom';

/**
 * 页面 Schema —— amis 方言（唯一方言，ADR-0003），形状由 G3 校验合同约束。
 */
export type PageSchema = Record<string, unknown>;

/** 页面元数据(存储于 pages 表)。 */
export interface PageMeta {
  id: string;
  tenantId?: string;
  appId: string;
  name: string;
  /** 页面 slug（应用内唯一；wire 字段名即 slug，运行时预览路由使用） */
  slug: string;
  /** API 名称（wire 上已与 slug 同值输出；新代码统一用 apiName） */
  apiName: string;
  type: PageType;
  /** 关联对象(列表/详情/表单页) */
  objectId?: string;
  /** 完整页面 Schema(仅详情接口返回;列表为体积摘要) */
  schema?: PageSchema;
  /** 是否发布 */
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 页面保存点（E2-4 飞书式历史；列表不含 schema 全量）。 */
export interface PageSavePointInfo {
  id: string;
  pageId: string;
  /** save = 保存自动捕获；restore = 历史恢复回滚点 */
  source: 'save' | 'restore';
  createdBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 请求体
// ---------------------------------------------------------------------------

export interface CreatePageRequest {
  name: string;
  apiName: string;
  type: PageType;
  objectId?: string;
  schema?: PageSchema;
}

export interface UpdatePageRequest {
  name?: string;
  apiName?: string;
  type?: PageType;
  objectId?: string;
  schema?: PageSchema;
  published?: boolean;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const pagesApi = {
  /** 页面列表 */
  list: (appId: string) =>
    client
      .get<ApiResponse<PageMeta[]>>(`/api/apps/${appId}/pages`)
      .then((res) => res.data.data as PageMeta[]),

  /** 页面详情(含 Schema) */
  get: (pageId: string) =>
    client
      .get<ApiResponse<PageMeta>>(`/api/pages/${pageId}`)
      .then((res) => res.data.data as PageMeta),

  /** 创建页面 */
  create: (appId: string, data: CreatePageRequest) =>
    client
      .post<ApiResponse<PageMeta>>(`/api/apps/${appId}/pages`, data)
      .then((res) => res.data.data as PageMeta),

  /** 更新页面(含 Schema 持久化) */
  update: (pageId: string, data: UpdatePageRequest) =>
    client
      .put<ApiResponse<PageMeta>>(`/api/pages/${pageId}`, data)
      .then((res) => res.data.data as PageMeta),

  /** 删除页面 */
  delete: (pageId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/pages/${pageId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 发布页面 */
  publish: (pageId: string) =>
    client
      .post<ApiResponse<PageMeta>>(`/api/pages/${pageId}/publish`)
      .then((res) => res.data.data as PageMeta),

  /** 保存点列表（E2-4 飞书式历史，按时间倒序） */
  listSavePoints: (pageId: string) =>
    client
      .get<ApiResponse<PageSavePointInfo[]>>(`/api/pages/${pageId}/save-points`)
      .then((res) => res.data.data as PageSavePointInfo[]),

  /** 恢复到保存点（返回恢复后的页面全量） */
  restoreSavePoint: (pageId: string, savePointId: string) =>
    client
      .post<ApiResponse<PageMeta>>(`/api/pages/${pageId}/save-points/${savePointId}/restore`)
      .then((res) => res.data.data as PageMeta),
};
