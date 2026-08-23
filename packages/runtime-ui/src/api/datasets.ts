/**
 * 数据集 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的 /api/datasets 端点，供运行时图表组件查询数据集行数据。
 */

import apiClient from './client';
import type { ChartAggregation, TimeGranularity } from '@apaas/shared';

/** 数据集列定义。 */
export interface DatasetColumn {
  apiName: string;
  label: string;
  type: string;
  source: string;
}

/** 数据集信息。 */
export interface DatasetInfo {
  id: string;
  name: string;
  status: string;
  rowCount: number;
  columns: DatasetColumn[];
}

/** 数据集行查询响应。 */
export interface DatasetRowListResponse {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

/** 图表聚合请求参数。 */
export interface ChartDataRequest {
  sourceType: 'object' | 'dataset';
  sourceId: string;
  categoryField?: string;
  valueField?: string;
  aggregation: ChartAggregation;
  filter?: Record<string, unknown> | null;
  timeGranularity?: TimeGranularity;
}

/** 图表聚合结果。 */
export interface ChartDataResult {
  data: Array<{ category: string; value: number }>;
  categories: string[];
  values: number[];
  totalRecords: number;
}

export const datasetsApi = {
  /** 获取数据集详情（含列定义） */
  get: (datasetId: string) =>
    apiClient
      .get<{ ok: true; data: DatasetInfo }>(`/datasets/${datasetId}`)
      .then((res) => res.data.data),

  /** 查询数据集行数据（分页） */
  queryRows: (
    datasetId: string,
    params: { page?: number; pageSize?: number; sort?: string; filter?: string },
  ) =>
    apiClient
      .get<{ ok: true; data: DatasetRowListResponse }>(`/datasets/${datasetId}/rows`, { params })
      .then((res) => res.data.data),

  /** 图表数据聚合（后端聚合引擎） */
  getChartData: (appId: string, request: ChartDataRequest) =>
    apiClient
      .post<{ ok: true; data: ChartDataResult }>(`/apps/${appId}/datasets/chart-data`, request)
      .then((res) => res.data.data),
};
