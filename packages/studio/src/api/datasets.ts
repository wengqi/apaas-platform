/**
 * 数据集与数据流 API 客户端 — Studio 用。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';

// ---------------------------------------------------------------------------
// 类型定义（与 @apaas/shared/dataset 对齐）
// ---------------------------------------------------------------------------

export type DatasetStatus = 'EMPTY' | 'REFRESHING' | 'READY' | 'FAILED';
export type DataFlowStatus = 'DRAFT' | 'ACTIVE';
export type AggregateFunction = 'sum' | 'count' | 'avg' | 'max' | 'min';
export type JoinType = 'left' | 'inner';
export type OutputColumnType = 'string' | 'number' | 'date';

export interface DataSourceConfig {
  objectId: string;
  alias: string;
}

export interface JoinConfig {
  leftAlias: string;
  rightAlias: string;
  type: JoinType;
  leftField: string;
  rightField: string;
}

export interface AggregationMetric {
  alias: string;
  label: string;
  field: string;
  function: AggregateFunction;
}

export interface AggregationConfig {
  groupBy: string[];
  metrics: AggregationMetric[];
}

export interface OutputFieldConfig {
  alias: string;
  label: string;
  source: string;
  type: OutputColumnType;
}

export interface DataFlowConfig {
  sources: DataSourceConfig[];
  join?: JoinConfig;
  filter?: object | null;
  aggregation?: AggregationConfig;
  outputFields: OutputFieldConfig[];
}

export interface DatasetColumn {
  apiName: string;
  label: string;
  type: OutputColumnType;
  source: string;
}

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

export interface CreateDataFlowRequest {
  apiName: string;
  name: string;
  description?: string;
  config: DataFlowConfig;
}

export interface UpdateDataFlowRequest {
  name?: string;
  description?: string;
  config?: DataFlowConfig;
  status?: DataFlowStatus;
}

export interface DatasetRowListResponse {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DataFlowPreviewResult {
  columns: DatasetColumn[];
  rows: Record<string, unknown>[];
  total: number;
}

// ---------------------------------------------------------------------------
// API 封装
// ---------------------------------------------------------------------------

const unwrap = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((res) => res.data.data as T);

/** 数据流 API。 */
export const dataFlowsApi = {
  list: (appId: string) => unwrap<DataFlow[]>(client.get(`/api/apps/${appId}/data-flows`)),
  get: (flowId: string) => unwrap<DataFlow>(client.get(`/api/data-flows/${flowId}`)),
  create: (appId: string, data: CreateDataFlowRequest) =>
    unwrap<DataFlow>(client.post(`/api/apps/${appId}/data-flows`, data)),
  update: (flowId: string, data: UpdateDataFlowRequest) =>
    unwrap<DataFlow>(client.put(`/api/data-flows/${flowId}`, data)),
  delete: (flowId: string) =>
    unwrap<{ deleted: boolean }>(client.delete(`/api/data-flows/${flowId}`)),
  preview: (flowId: string) =>
    unwrap<DataFlowPreviewResult>(client.post(`/api/data-flows/${flowId}/preview`)),
  execute: (flowId: string) =>
    unwrap<{ datasetId: string }>(client.post(`/api/data-flows/${flowId}/execute`)),
};

/** 图表聚合请求参数。 */
export interface ChartDataRequest {
  sourceType: 'object' | 'dataset';
  sourceId: string;
  categoryField?: string;
  valueField?: string;
  aggregation: AggregateFunction;
  filter?: Record<string, unknown> | null;
  timeGranularity?: 'day' | 'week' | 'month';
}

/** 图表聚合结果。 */
export interface ChartDataResult {
  data: Array<{ category: string; value: number }>;
  categories: string[];
  values: number[];
  totalRecords: number;
}

/** 数据集 API。 */
export const datasetsApi = {
  list: (appId: string) => unwrap<Dataset[]>(client.get(`/api/apps/${appId}/datasets`)),
  get: (datasetId: string) => unwrap<Dataset>(client.get(`/api/datasets/${datasetId}`)),
  delete: (datasetId: string) =>
    unwrap<{ deleted: boolean }>(client.delete(`/api/datasets/${datasetId}`)),
  queryRows: (
    datasetId: string,
    params: { page?: number; pageSize?: number; sort?: string; filter?: string },
  ) => unwrap<DatasetRowListResponse>(client.get(`/api/datasets/${datasetId}/rows`, { params })),
  refresh: (datasetId: string) =>
    unwrap<{ datasetId: string }>(client.post(`/api/datasets/${datasetId}/refresh`)),
  getChartData: (appId: string, request: ChartDataRequest) =>
    unwrap<ChartDataResult>(client.post(`/api/apps/${appId}/datasets/chart-data`, request)),
};
