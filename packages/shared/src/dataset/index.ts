/**
 * 数据集与数据流类型契约 — 物化数据 + 数据变换 pipeline。
 *
 * 飞书对齐 Module B：数据集与数据流。
 * 数据流定义 pipeline（数据源 → 筛选 → 关联 → 分组汇总 → 输出），
 * 执行后生成数据集（物化数据，非视图）。
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/** 数据集状态。 */
export type DatasetStatus = 'EMPTY' | 'REFRESHING' | 'READY' | 'FAILED';

/** 数据流状态。 */
export type DataFlowStatus = 'DRAFT' | 'ACTIVE';

/** 聚合函数。 */
export type AggregateFunction = 'sum' | 'count' | 'avg' | 'max' | 'min';

/** 关联类型。 */
export type JoinType = 'left' | 'inner';

/** 输出列类型。 */
export type OutputColumnType = 'string' | 'number' | 'date';

// ---------------------------------------------------------------------------
// 数据流配置（JSON pipeline 定义）
// ---------------------------------------------------------------------------

/** 数据源配置。 */
export interface DataSourceConfig {
  /** 源对象 ID */
  objectId: string;
  /** 别名（用于关联引用，如 "orders"） */
  alias: string;
}

/** 关联配置。 */
export interface JoinConfig {
  /** 主表别名 */
  leftAlias: string;
  /** 关联表别名 */
  rightAlias: string;
  /** 关联类型 */
  type: JoinType;
  /** 左表字段（通常是 Lookup 字段的 apiName） */
  leftField: string;
  /** 右表字段（通常是关联对象的主键字段） */
  rightField: string;
}

/** 聚合指标。 */
export interface AggregationMetric {
  /** 输出列 apiName */
  alias: string;
  /** 输出列显示名称 */
  label: string;
  /** 源字段（聚合对象） */
  field: string;
  /** 聚合函数 */
  function: AggregateFunction;
}

/** 分组汇总配置。 */
export interface AggregationConfig {
  /** 分组字段 */
  groupBy: string[];
  /** 聚合指标 */
  metrics: AggregationMetric[];
}

/** 输出字段配置。 */
export interface OutputFieldConfig {
  /** 输出列 apiName */
  alias: string;
  /** 输出列显示名称 */
  label: string;
  /** 源字段路径（如 "orders.title" 或 "customers.name"） */
  source: string;
  /** 列类型（用于前端渲染） */
  type: OutputColumnType;
}

/** 数据流配置 — pipeline 步骤定义。 */
export interface DataFlowConfig {
  /** 数据源（可多个，用于关联） */
  sources: DataSourceConfig[];
  /** 关联配置（可选，多表 join） */
  join?: JoinConfig;
  /** 筛选条件（JsonLogic，复用现有翻译器） */
  filter?: object | null;
  /** 分组汇总（可选） */
  aggregation?: AggregationConfig;
  /** 输出字段映射（最终输出的列） */
  outputFields: OutputFieldConfig[];
}

// ---------------------------------------------------------------------------
// 实体接口
// ---------------------------------------------------------------------------

/** 数据集列定义。 */
export interface DatasetColumn {
  apiName: string;
  label: string;
  type: OutputColumnType;
  source: string;
}

/** 数据集实体。 */
export interface Dataset {
  id: string;
  tenantId: string;
  appId: string;
  apiName: string;
  name: string;
  description?: string;
  sourceFlowId: string;
  status: DatasetStatus;
  rowCount: number;
  columns: DatasetColumn[];
  lastRefreshedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

/** 数据流实体。 */
export interface DataFlow {
  id: string;
  tenantId: string;
  appId: string;
  apiName: string;
  name: string;
  description?: string;
  config: DataFlowConfig;
  outputColumns?: DatasetColumn[];
  status: DataFlowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 请求 DTO
// ---------------------------------------------------------------------------

/** 创建数据流请求。 */
export interface CreateDataFlowRequest {
  apiName: string;
  name: string;
  description?: string;
  config: DataFlowConfig;
}

/** 更新数据流请求。 */
export interface UpdateDataFlowRequest {
  name?: string;
  description?: string;
  config?: DataFlowConfig;
  status?: DataFlowStatus;
}

/** 数据集行查询参数。 */
export interface DatasetRowQueryParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  filter?: string;
}

/** 数据集行查询响应。 */
export interface DatasetRowListResponse {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

/** 数据流预览响应。 */
export interface DataFlowPreviewResult {
  columns: DatasetColumn[];
  rows: Record<string, unknown>[];
  total: number;
}
