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
  /** 显示顺序(拖拽排序用;无值时按数组顺序) */
  order?: number;
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
  /** 显示名称（后端 ObjectMeta.name 字段） */
  name: string;
  /** 兼容旧引用，等同于 name */
  label: string;
  labelPlural?: string;
  icon?: string;
  nameFieldId?: string;
  description?: string;
  isSystem: boolean;
  /** 字段定义（list 接口也返回） */
  fields?: Field[];
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

/** 筛选操作符(对齐 shared FilterOperator 枚举)。 */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in';

/** 视图排序配置(field 为字段 apiName)。 */
export interface ViewSortConfig {
  field: string;
  order: 'asc' | 'desc';
}

/** 视图字段显隐配置。 */
export interface ViewFieldConfig {
  fieldId: string;
  /** 显示顺序 */
  order: number;
}

/** 视图配置(存于 View.config JSON 字段)。 */
export interface ViewConfig {
  /** JsonLogic JSON 规则（如 {"and": [{"==": [{"var":"status"}, "active"]}]}） */
  filters?: object | null;
  sorts?: ViewSortConfig[];
  fields?: ViewFieldConfig[];
}

/** 视图信息(列表/详情)。 */
export interface ViewInfo {
  id: string;
  objectId: string;
  name: string;
  type: ViewType;
  isDefault: boolean;
  /** 视图配置 JSON(filters/sorts/fields);后端实际返回此字段 */
  config?: ViewConfig;
  /** 兼容旧字段(后端未单独返回,实际数据在 config 内) */
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
  /** 显示顺序(拖拽排序) */
  order?: number;
}

export interface CreateViewRequest {
  name: string;
  type: ViewType;
  isDefault?: boolean;
  config?: ViewConfig;
}

export interface UpdateViewRequest {
  name?: string;
  type?: ViewType;
  config?: ViewConfig;
}

// ---------------------------------------------------------------------------
// 记录(运行时数据)
// ---------------------------------------------------------------------------

/** 一条记录(业务字段值存于 data,key = field.apiName)。 */
export interface RecordItem {
  id: string;
  objectId: string;
  /** 业务字段值 */
  data: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 分页查询结果。 */
export interface PaginatedRecords {
  items: RecordItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 查询记录参数(filter 为 JSON 字符串,field 用 apiName)。 */
export interface QueryRecordsParams {
  page?: number;
  pageSize?: number;
  /** "fieldApiName:asc" 或 "fieldApiName:desc" */
  sort?: string;
  /** JsonLogic JSON 字符串，如 {"==": [{"var":"status"}, "active"]} */
  filter?: string;
}

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

  /** 创建对象 — 前端用 label，后端用 name，双向转换 */
  create: (appId: string, data: CreateObjectRequest) =>
    client
      .post<ApiResponse<ObjectInfo>>(`/api/apps/${appId}/objects`, {
        ...data,
        name: data.label,
      })
      .then((res) => {
        const d = res.data.data as ObjectInfo;
        return { ...d, label: d.label ?? d.name };
      }),

  /** 更新对象 — 前端用 label，后端用 name，双向转换 */
  update: (objectId: string, data: UpdateObjectRequest) =>
    client
      .put<ApiResponse<ObjectInfo>>(`/api/objects/${objectId}`, {
        ...data,
        ...(data.label !== undefined && { name: data.label }),
      })
      .then((res) => {
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
  records: {
    /** 分页查询记录(支持筛选/排序) */
    list: (objectId: string, params: QueryRecordsParams) =>
      client
        .get<ApiResponse<PaginatedRecords>>(`/api/objects/${objectId}/records`, {
          params: {
            page: params.page,
            pageSize: params.pageSize,
            sort: params.sort,
            filter: params.filter,
          },
        })
        .then((res) => res.data.data as PaginatedRecords),

    /** 创建记录 */
    create: (objectId: string, data: Record<string, unknown>) =>
      client
        .post<ApiResponse<RecordItem>>(`/api/objects/${objectId}/records`, { data })
        .then((res) => res.data.data as RecordItem),

    /** 更新记录(部分更新) */
    update: (recordId: string, data: Record<string, unknown>) =>
      client
        .put<ApiResponse<RecordItem>>(`/api/records/${recordId}`, { data })
        .then((res) => res.data.data as RecordItem),

    /** 删除记录 */
    delete: (recordId: string) =>
      client
        .delete<ApiResponse<{ deleted: boolean }>>(`/api/records/${recordId}`)
        .then((res) => res.data.data as { deleted: boolean }),

    /** 批量创建记录 */
    batchCreate: (objectId: string, records: Record<string, unknown>[]) =>
      client
        .post<ApiResponse<{ created: number; errors: Array<{ row: number; message: string }> }>>(
          `/api/objects/${objectId}/records/batch-create`,
          { records },
        )
        .then((res) => res.data.data!),

    /** 批量更新记录 */
    batchUpdate: (recordIds: string[], data: Record<string, unknown>) =>
      client
        .put<ApiResponse<{ updated: number; errors: Array<{ row: number; message: string }> }>>(
          `/api/records/batch-update`,
          { recordIds, data },
        )
        .then((res) => res.data.data!),

    /** 批量删除记录 */
    batchDelete: (recordIds: string[]) =>
      client
        .post<ApiResponse<{ deleted: number }>>(`/api/records/batch-delete`, { recordIds })
        .then((res) => res.data.data!),

    /** 导出记录为 CSV（返回 blob） */
    exportCsv: (objectId: string, params: { sort?: string; filter?: string }) =>
      client
        .get(`/api/objects/${objectId}/records/export`, {
          params,
          responseType: 'blob',
        })
        .then((res) => res.data as Blob),

    /** 从 CSV 导入记录（FormData 上传） */
    importCsv: (objectId: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client
        .post<
          ApiResponse<{
            total: number;
            success: number;
            errors: Array<{ row: number; message: string }>;
          }>
        >(`/api/objects/${objectId}/records/import`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((res) => res.data.data!);
    },

    /** 下载导入模板 CSV（返回 blob） */
    getImportTemplate: (objectId: string) =>
      client
        .get(`/api/objects/${objectId}/records/import-template`, { responseType: 'blob' })
        .then((res) => res.data as Blob),
  },
};
