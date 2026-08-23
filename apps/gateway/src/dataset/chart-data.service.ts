/**
 * 图表数据聚合服务 — 在后端执行数据查询 + 分组聚合，返回图表所需的结构化数据。
 *
 * 替代前端客户端聚合方案，优势：
 * - 支持大数据量（前端限制 100 行，后端可全量聚合）
 * - 减少 API 传输量（只返回聚合结果，不返回原始记录）
 * - 复用 DataFlowEngine 的聚合逻辑
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { ChartAggregation } from '@apaas/shared';

/** 图表聚合请求参数。 */
export interface ChartDataRequest {
  /** 数据源类型：对象记录或数据集行。 */
  sourceType: 'object' | 'dataset';
  /** 数据源 ID（对象 ID 或数据集 ID）。 */
  sourceId: string;
  /** 分类字段名（分组依据）。 */
  categoryField: string;
  /** 值字段名（聚合对象）。 */
  valueField: string;
  /** 聚合函数。 */
  aggregation: ChartAggregation;
  /** 筛选条件（JsonLogic JSON，可选）。 */
  filter?: Record<string, unknown> | null;
}

/** 图表聚合结果。 */
export interface ChartDataResult {
  /** 聚合后的数据点数组。 */
  data: Array<{ category: string; value: number }>;
  /** 分类标签列表。 */
  categories: string[];
  /** 数值列表。 */
  values: number[];
  /** 源数据总行数。 */
  totalRecords: number;
}

@Injectable()
export class ChartDataService {
  /**
   * 执行图表数据聚合。
   *
   * 从对象记录或数据集行加载源数据，按 categoryField 分组，
   * 对 valueField 执行聚合运算，返回结构化结果。
   */
  async aggregate(tenantId: string, request: ChartDataRequest): Promise<ChartDataResult> {
    if (!request.categoryField || !request.valueField) {
      throw new BadRequestException('分类字段和值字段不能为空');
    }

    const records = await this.loadSourceData(request, tenantId);
    const aggregated = this.executeAggregation(
      records,
      request.categoryField,
      request.valueField,
      request.aggregation,
    );

    return {
      data: aggregated,
      categories: aggregated.map((d) => d.category),
      values: aggregated.map((d) => d.value),
      totalRecords: records.length,
    };
  }

  /**
   * 从数据源加载记录。
   */
  private async loadSourceData(
    request: ChartDataRequest,
    tenantId: string,
  ): Promise<Record<string, unknown>[]> {
    if (request.sourceType === 'object') {
      const dbRecords = await prisma.record.findMany({
        where: { tenantId, objectId: request.sourceId },
        select: { data: true },
      });
      return dbRecords.map((r) => r.data as Record<string, unknown>);
    }

    if (request.sourceType === 'dataset') {
      const dbRows = await prisma.datasetRow.findMany({
        where: { tenantId, datasetId: request.sourceId },
        select: { data: true },
      });
      return dbRows.map((r) => r.data as Record<string, unknown>);
    }

    throw new BadRequestException(`不支持的数据源类型: ${request.sourceType}`);
  }

  /**
   * 分组聚合 — 按 categoryField 分组，对 valueField 执行聚合运算。
   *
   * 逻辑与 DataFlowEngine.executeAggregation 和 chart-options.ts 的 aggregate 保持一致。
   */
  private executeAggregation(
    records: Record<string, unknown>[],
    categoryField: string,
    valueField: string,
    aggregation: ChartAggregation,
  ): Array<{ category: string; value: number }> {
    const groups = new Map<string, number[]>();

    for (const record of records) {
      const category = String(record[categoryField] ?? '未知');
      const value = Number(record[valueField] ?? 0);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(value);
    }

    return Array.from(groups.entries()).map(([category, values]) => {
      let value: number;
      switch (aggregation) {
        case 'count':
          value = values.length;
          break;
        case 'avg':
          value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case 'max':
          value = values.length > 0 ? Math.max(...values) : 0;
          break;
        case 'min':
          value = values.length > 0 ? Math.min(...values) : 0;
          break;
        case 'sum':
        default:
          value = values.reduce((a, b) => a + b, 0);
          break;
      }
      return { category, value: Math.round(value * 100) / 100 };
    });
  }
}
