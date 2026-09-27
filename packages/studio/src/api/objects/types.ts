/**
 * 从 api/objects.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 对象 / 数据建模 类型契约。
 *
 * 类型契约对齐 packages/shared/src/object/index.ts(SSOT),
 * 但 Studio 不直接依赖 @apaas/shared,这里以接口形式重新声明,
 * ID 统一用 string(运行时与品牌 ID 同为 string),便于前端直接使用。
 */

import type { FieldType } from '../../constants/fieldTypes.js';

// ---------------------------------------------------------------------------
// 选项 / 字段配置
// ---------------------------------------------------------------------------

/** 单选项定义。 */
export interface SelectOption {
  /** 评审整改：存储值（留空回退 label），使流程条件/集成依据稳定编码 */
  value?: string;
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
  rollup?: {
    relationFieldId: string;
    targetFieldId?: string;
    aggregate: 'sum' | 'avg' | 'count' | 'min' | 'max';
  };
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
  /** 默认视图标记（后端无独立列，存于 config JSON） */
  isDefault?: boolean;
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

/** 与后端 CreateObjectDto 对齐：字段名为 name（非 label）。 */
export interface CreateObjectRequest {
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
}

/** 与后端 UpdateObjectDto 对齐：字段名为 name（非 label）。 */
export interface UpdateObjectRequest {
  name?: string;
  description?: string;
  icon?: string;
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
