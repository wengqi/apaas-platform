import client from './client.js';
import type { ApiResponse } from './client.js';
import type { FieldType } from '../constants/fieldTypes.js';

/**
 * 对象 / 数据建模 API 封装。
 *
 * 类型契约对齐 packages/shared/src/object/index.ts(SSOT),
 * 但 Studio 不直接依赖 @apaas/shared,这里以接口形式重新声明,
 * ID 统一用 string(运行时与品牌 ID 同为 string),便于前端直接使用。
 *
 * 后端响应统一包裹为 { ok: true, data: ... },取 res.data.data。
 */

// ---------------------------------------------------------------------------
// 选项 / 字段配置
// ---------------------------------------------------------------------------

/** 单选项定义。 */
export interface SelectOption {
  id: string;
  label: string;
  color?: string;
  /** 是否默认选中(单选仅一个可为 true) */
  isDefault?: boolean;
}

/**
 * 字段配置(前端宽松联合,按 type 区分有效字段)。
 * 后端按 type 校验对应字段,前端构造时只填充相关项。
 */
export interface FieldConfig {
  type: FieldType;
  maxLength?: number;
  number?: { precision: number };
  currency?: { precision: number; code: string };
  autoNumber?: { format: string };
  options?: SelectOption[];
  format?: string;
  multi?: boolean;
  lookup?: { targetObjectId: string; relationType: string; inverseFieldName?: string };
  subForm?: { childObjectId: string; parentFieldId: string };
  formula?: { expression: string; returnType: string };
  rollup?: { targetFieldId: string; aggregate: string };
}

// ---------------------------------------------------------------------------
// 字段
// ---------------------------------------------------------------------------

/** 字段定义(元数据)。 */
export interface Field {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  type: FieldType;
  config: FieldConfig;
  required: boolean;
  unique: boolean;
  searchable: boolean;
  defaultValue?: unknown;
  description?: string;
  /** 系统字段(如 id/created_at,不可删除) */
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 对象
// ---------------------------------------------------------------------------

/** 对象概要(列表用,含统计)。 */
export interface ObjectInfo {
  id: string;
  appId: string;
  apiName: string;
  label: string;
  labelPlural?: string;
  icon?: string;
  nameFieldId?: string;
  description?: string;
  isSystem: boolean;
  recordLevelSecurity: boolean;
  /** 字段数(列表展示) */
  fieldCount?: number;
  /** 记录数(列表展示) */
  recordCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** 对象 + 其下字段(详情聚合视图)。 */
export interface ObjectWithFields extends ObjectInfo {
  fields: Field[];
}

// ---------------------------------------------------------------------------
// 视图
// ---------------------------------------------------------------------------

export type ViewType = 'list' | 'detail' | 'form' | 'kanban' | 'calendar' | 'gallery';

/** 视图信息(列表/详情)。 */
export interface ViewInfo {
  id: string;
  objectId: string;
  name: string;
  type: ViewType;
  isDefault: boolean;
  fields?: unknown[];
  sorts?: unknown[];
  filters?: unknown;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 请求体
// ---------------------------------------------------------------------------

export interface CreateObjectRequest {
  apiName: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface UpdateObjectRequest {
  label?: string;
  description?: string;
  icon?: string;
  nameFieldId?: string;
  recordLevelSecurity?: boolean;
}

export interface CreateFieldRequest {
  apiName: string;
  label: string;
  type: FieldType;
  config: FieldConfig;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface UpdateFieldRequest {
  label?: string;
  apiName?: string;
  config?: FieldConfig;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  description?: string;
  defaultValue?: unknown;
}

export interface CreateViewRequest {
  name: string;
  type: ViewType;
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const objectsApi = {
  /** 对象列表 */
  list: (appId: string) =>
    client
      .get<ApiResponse<ObjectInfo[]>>(`/api/apps/${appId}/objects`)
      .then((res) => res.data.data as ObjectInfo[]),

  /** 对象详情(含字段) */
  get: (objectId: string) =>
    client
      .get<ApiResponse<ObjectWithFields>>(`/api/objects/${objectId}`)
      .then((res) => res.data.data as ObjectWithFields),

  /** 创建对象 */
  create: (appId: string, data: CreateObjectRequest) =>
    client
      .post<ApiResponse<ObjectInfo>>(`/api/apps/${appId}/objects`, data)
      .then((res) => res.data.data as ObjectInfo),

  /** 更新对象 */
  update: (objectId: string, data: UpdateObjectRequest) =>
    client
      .put<ApiResponse<ObjectInfo>>(`/api/objects/${objectId}`, data)
      .then((res) => res.data.data as ObjectInfo),

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

  /** 视图列表 */
  listViews: (objectId: string) =>
    client
      .get<ApiResponse<ViewInfo[]>>(`/api/objects/${objectId}/views`)
      .then((res) => res.data.data as ViewInfo[]),

  /** 创建视图 */
  createView: (objectId: string, data: CreateViewRequest) =>
    client
      .post<ApiResponse<ViewInfo>>(`/api/objects/${objectId}/views`, data)
      .then((res) => res.data.data as ViewInfo),
};
