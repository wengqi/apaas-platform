/**
 * 对象 / 数据建模 API 封装。
 *
 * 类型契约对齐 packages/shared/src/object/index.ts(SSOT),
 * 但 Studio 不直接依赖 @apaas/shared,这里以接口形式重新声明,
 * ID 统一用 string(运行时与品牌 ID 同为 string),便于前端直接使用。
 *
 * 后端响应统一包裹为 { ok: true, data: ... },取 res.data.data。
 *
 * 拆分说明（AGENTS.md 单文件 400 行规范）：
 * - 类型契约位于 ./objects/types.js
 * - 记录子 API 位于 ./objects/records.js
 * 本文件保持原有导出面（objectsApi + 全部类型）不变,继续作为兼容入口。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import { recordsApi } from './objects/records.js';
import type {
  CreateFieldRequest,
  CreateObjectRequest,
  CreateViewRequest,
  Field,
  ObjectInfo,
  ObjectWithFields,
  UpdateFieldRequest,
  UpdateObjectRequest,
  UpdateViewRequest,
  ViewInfo,
} from './objects/types.js';

export type {
  SelectOption,
  FieldConfig,
  Field,
  ObjectInfo,
  ObjectWithFields,
  ViewType,
  FilterOperator,
  ViewSortConfig,
  ViewFieldConfig,
  ViewConfig,
  ViewInfo,
  CreateObjectRequest,
  UpdateObjectRequest,
  CreateFieldRequest,
  UpdateFieldRequest,
  CreateViewRequest,
  UpdateViewRequest,
  RecordItem,
  PaginatedRecords,
  QueryRecordsParams,
} from './objects/types.js';

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const objectsApi = {
  /** 对象列表 — 后端返回 name，前端映射为 label */
  list: (appId: string) =>
    client
      .get<ApiResponse<ObjectInfo[]>>(`/api/apps/${appId}/objects`)
      .then((res) =>
        (res.data.data as ObjectInfo[]).map((o) => ({ ...o, label: o.label ?? o.name })),
      ),

  /** 对象详情(含字段) — 后端返回 name，前端映射为 label */
  get: (objectId: string) =>
    client.get<ApiResponse<ObjectWithFields>>(`/api/objects/${objectId}`).then((res) => {
      const data = res.data.data as ObjectWithFields;
      return { ...data, label: data.label ?? data.name };
    }),

  /** 创建对象 — 请求字段与后端 CreateObjectDto 一致（name）；响应统一补 label 便于展示 */
  create: (appId: string, data: CreateObjectRequest) =>
    client.post<ApiResponse<ObjectInfo>>(`/api/apps/${appId}/objects`, data).then((res) => {
      const d = res.data.data as ObjectInfo;
      return { ...d, label: d.label ?? d.name };
    }),

  /** 更新对象 — 请求字段与后端 UpdateObjectDto 一致（name）；响应统一补 label 便于展示 */
  update: (objectId: string, data: UpdateObjectRequest) =>
    client.put<ApiResponse<ObjectInfo>>(`/api/objects/${objectId}`, data).then((res) => {
      const d = res.data.data as ObjectInfo;
      return { ...d, label: d.label ?? d.name };
    }),

  /** 删除对象 */
  delete: (objectId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/objects/${objectId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 新增字段 */
  addField: (objectId: string, data: CreateFieldRequest) =>
    client
      .post<ApiResponse<Field>>(`/api/objects/${objectId}/fields`, data)
      .then((res) => res.data.data as Field),

  /** 更新字段 */
  updateField: (objectId: string, fieldId: string, data: UpdateFieldRequest) =>
    client
      .put<ApiResponse<Field>>(`/api/objects/${objectId}/fields/${fieldId}`, data)
      .then((res) => res.data.data as Field),

  /** 删除字段 */
  deleteField: (objectId: string, fieldId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/objects/${objectId}/fields/${fieldId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 视图列表 — isDefault 存于 config JSON，统一映射到顶层便于展示 */
  listViews: (objectId: string) =>
    client.get<ApiResponse<ViewInfo[]>>(`/api/objects/${objectId}/views`).then((res) =>
      (res.data.data as ViewInfo[]).map((v) => ({
        ...v,
        isDefault: v.config?.isDefault === true,
      })),
    ),

  /** 创建视图 */
  createView: (objectId: string, data: CreateViewRequest) =>
    client.post<ApiResponse<ViewInfo>>(`/api/objects/${objectId}/views`, data).then((res) => {
      const v = res.data.data as ViewInfo;
      return { ...v, isDefault: v.config?.isDefault === true };
    }),

  /** 更新视图 */
  updateView: (viewId: string, data: UpdateViewRequest) =>
    client
      .put<ApiResponse<ViewInfo>>(`/api/views/${viewId}`, data)
      .then((res) => res.data.data as ViewInfo),

  /** 删除视图 */
  deleteView: (viewId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/views/${viewId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 记录相关 API */
  records: recordsApi,
};
