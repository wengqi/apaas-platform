/**
 * 图表数据聚合服务 — 在后端执行数据查询 + 分组聚合，返回图表所需的结构化数据。
 *
 * 替代前端客户端聚合方案，优势：
 * - 支持大数据量（前端限制 100 行，后端可全量聚合）
 * - 减少 API 传输量（只返回聚合结果，不返回原始记录）
 * - 复用 DataFlowEngine 的聚合逻辑
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, Prisma, getEnvironmentId } from '@apaas/db';
import jsonLogic from 'json-logic-js';
import type { ChartAggregation, TimeGranularity } from '@apaas/shared';
import { translateCondition } from '../permission/condition-translator.js';
import { NUMERIC_TEXT_RE, translateJsonLogicToSql } from './jsonlogic-to-sql.js';
import type { PermissionContext } from '../auth/authenticated-request.js';

/** 后端聚合最大加载行数（防御性，避免全表加载）。 */
const CHART_DATA_MAX_ROWS = 10000;

/** 字段名白名单（内联 SQL 前必须通过——与 record-query/jsonlogic-to-sql 同口径） */
const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** 当前请求环境键（raw SQL 显式过滤用；与 GIN 下推路径同口径）。 */
function envOfRequest(): string {
  return (getEnvironmentId as (() => string | null) | undefined)?.() ?? 'prod';
}

/** 标量聚合（无分类字段时）的默认分组标签。 */
const SCALAR_CATEGORY = '_total';

/** 图表聚合请求参数。 */
export interface ChartDataRequest {
  /** 数据源类型：对象记录或数据集行。 */
  sourceType: 'object' | 'dataset';
  /** 数据源 ID（对象 ID 或数据集 ID）。 */
  sourceId: string;
  /** 分类字段名（分组依据）。省略时返回标量聚合值（指标卡用）。 */
  categoryField?: string;
  /** 值字段名（聚合对象）。count 聚合时可省略。 */
  valueField?: string;
  /** 聚合函数。 */
  aggregation: ChartAggregation;
  /** 筛选条件（JsonLogic JSON，可选）。 */
  filter?: Record<string, unknown> | null;
  /** 时间分桶粒度（当 categoryField 为日期字段时使用）。 */
  timeGranularity?: TimeGranularity;
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
   *
   * 当 categoryField 省略时，所有记录归入单组，返回标量值（指标卡用）。
   * 当 timeGranularity 存在时，categoryField 按时间分桶聚合。
   *
   * 安全（P0 修复）：
   * - 数据源归属校验：对象/数据集必须属于 appId，防止跨应用读取
   * - ABAC 行级条件注入：聚合范围与 record.query 一致，防止聚合端点旁路行权限
   * - fieldScope 列级校验：分类/值字段必须在规则白名单内
   */
  async aggregate(
    tenantId: string,
    appId: string,
    request: ChartDataRequest,
    permissionContext?: PermissionContext,
  ): Promise<ChartDataResult> {
    if (request.aggregation !== 'count' && !request.valueField) {
      throw new BadRequestException('非 count 聚合必须指定值字段');
    }

    this.assertFieldsInScope(request, permissionContext);

    // P1-17（用户裁决=SQL 下推）：object 源 + 无 ABAC 行级条件 + 无时间分桶时，
    // 聚合整体下推 DB（GROUP BY + 守卫 cast + 全量 COUNT OVER）——旧实现拉 1 万行
    // 进内存且 take 无 orderBy 静默截断（实测 sum=10000/真值 12000）。
    // 保留内存路径：ABAC 条件（权限语义优先不可旁路）/ timeGranularity（时间分桶
    // 语义复杂）/ dataset 源（DatasetRow 不在本次下推范围）。
    const canPushDown =
      request.sourceType === 'object' && !permissionContext?.condition && !request.timeGranularity;
    if (canPushDown) {
      return this.aggregateViaSql(tenantId, appId, request);
    }

    let records = await this.loadSourceData(tenantId, appId, request, permissionContext);

    if (request.filter) {
      records = records.filter((r) => jsonLogic.apply(request.filter!, r) === true);
    }

    const aggregated = this.executeAggregation(
      records,
      request.categoryField,
      request.valueField,
      request.aggregation,
      request.timeGranularity,
    );

    return {
      data: aggregated,
      categories: aggregated.map((d) => d.category),
      values: aggregated.map((d) => d.value),
      totalRecords: records.length,
    };
  }

  /**
   * object 源聚合的 SQL 下推（P1-17）。
   *
   * SQL 形态：域过滤（tenant/object/env）+ filter 可译则 WHERE + GROUP BY 分类键
   * （COALESCE 空值 '未知'，与内存 resolveCategory 对齐）+ 守卫 cast 聚合
   * （G5 同款 CASE WHEN ~ 数值正则；count 用 COUNT(*)）+ COUNT(*) OVER () 全量计数。
   * filter 不可翻译时回退内存路径（既有上限保护）。
   */
  private async aggregateViaSql(
    tenantId: string,
    appId: string,
    request: ChartDataRequest,
  ): Promise<ChartDataResult> {
    // 归属校验与内存路径同门
    const obj = await prisma.objectMeta.findFirst({
      where: { id: request.sourceId, tenantId, appId },
      select: { id: true },
    });
    if (!obj) throw new NotFoundException('数据源对象不存在或不属于当前应用');

    // 域过滤参数位先行（$1 tenant/$2 object/$3 env），filter 翻译参数顺延
    const sqlValues: unknown[] = [tenantId, request.sourceId, envOfRequest()];
    const filterFrag = request.filter
      ? translateJsonLogicToSql(request.filter, 'r.data', sqlValues.length)
      : null;
    if (filterFrag) sqlValues.push(...filterFrag.params);
    if (request.filter && !filterFrag) {
      // filter 不可翻译 → 内存路径兜底（拉行上限保护）
      const records = await this.loadSourceData(tenantId, appId, request, undefined);
      const filtered = records.filter((r) => jsonLogic.apply(request.filter!, r) === true);
      const aggregated = this.executeAggregation(
        filtered,
        request.categoryField,
        request.valueField,
        request.aggregation,
        request.timeGranularity,
      );
      return {
        data: aggregated,
        categories: aggregated.map((d) => d.category),
        values: aggregated.map((d) => d.value),
        totalRecords: filtered.length,
      };
    }

    // P1-17 安全：字段名内联 SQL 前白名单校验（用户可控——防标识符注入）
    for (const f of [request.categoryField, request.valueField]) {
      if (f && !FIELD_NAME_RE.test(f)) {
        throw new BadRequestException(`字段名不合法: ${f}`);
      }
    }
    const category = request.categoryField
      ? `COALESCE(NULLIF(r.data->>'${request.categoryField}', ''), '未知')`
      : `'${SCALAR_CATEGORY}'`;
    const guarded = request.valueField
      ? `(CASE WHEN r.data->>'${request.valueField}' ~ '${NUMERIC_TEXT_RE}' THEN (r.data->>'${request.valueField}')::numeric END)`
      : null;
    let aggExpr: string;
    switch (request.aggregation) {
      case 'count':
        aggExpr = 'COUNT(*)';
        break;
      case 'avg':
        aggExpr = `ROUND(COALESCE(SUM(${guarded}) / NULLIF(COUNT(${guarded}), 0), 0), 2)`;
        break;
      case 'max':
        aggExpr = `ROUND(COALESCE(MAX(${guarded}), 0), 2)`;
        break;
      case 'min':
        aggExpr = `ROUND(COALESCE(MIN(${guarded}), 0), 2)`;
        break;
      case 'sum':
      default:
        aggExpr = `ROUND(COALESCE(SUM(${guarded}), 0), 2)`;
        break;
    }

    // raw SQL 不经 $extends，显式过滤环境（与 GIN 下推路径同口径）；值一律参数绑定
    const whereParts = ['r.tenant_id = $1', 'r.object_id = $2', 'r.environment_id = $3'];
    if (filterFrag) whereParts.push(`(${filterFrag.text})`);

    // 标量聚合（category 为常量）不能 GROUP BY 常量（PG 42601）——整表单组省 GROUP BY
    const groupByClause = request.categoryField ? `GROUP BY ${category}` : '';
    const rows = await prisma.$queryRawUnsafe<
      Array<{ category: string; value: number; total: number }>
    >(
      `SELECT ${category} AS category, ${aggExpr}::float8 AS value,
              COUNT(*) OVER (PARTITION BY TRUE)::int AS total
       FROM records r
       WHERE ${whereParts.join(' AND ')}
       ${groupByClause}
       ORDER BY category`,
      ...sqlValues,
    );

    const data = rows.map((row) => ({
      category: row.category,
      value: Math.round(Number(row.value) * 100) / 100,
    }));
    return {
      data,
      categories: data.map((d) => d.category),
      values: data.map((d) => d.value),
      totalRecords: rows[0]?.total ?? 0,
    };
  }

  /**
   * fieldScope 列级校验 — 分类/值字段必须在规则白名单内（fieldScope=null 不限制）。
   * 防止持有列级受限规则的用户对范围外字段执行聚合读取。
   */
  private assertFieldsInScope(
    request: ChartDataRequest,
    permissionContext?: PermissionContext,
  ): void {
    const fieldScope = permissionContext?.fieldScope;
    if (!fieldScope) return;

    const allowed = new Set(fieldScope);
    const denied: string[] = [];
    if (request.categoryField && !allowed.has(request.categoryField)) {
      denied.push(request.categoryField);
    }
    if (request.valueField && !allowed.has(request.valueField)) {
      denied.push(request.valueField);
    }
    if (denied.length > 0) {
      throw new ForbiddenException(`字段不在可访问范围内: ${denied.join(', ')}`);
    }
  }

  /** 将权限上下文中的 ABAC 行级条件翻译为 Prisma where 片段。 */
  private buildConditionWhere(
    permissionContext?: PermissionContext,
  ): Prisma.RecordWhereInput | null {
    if (!permissionContext?.condition) return null;
    return translateCondition(permissionContext.condition, {
      currentUser: permissionContext.currentUserId,
    });
  }

  /**
   * 从数据源加载记录（含归属校验 + 行级条件注入）。
   */
  private async loadSourceData(
    tenantId: string,
    appId: string,
    request: ChartDataRequest,
    permissionContext?: PermissionContext,
  ): Promise<Record<string, unknown>[]> {
    if (request.sourceType === 'object') {
      // 归属校验：对象必须属于当前应用（防止凭 objectId 跨应用读取）
      const obj = await prisma.objectMeta.findFirst({
        where: { id: request.sourceId, tenantId, appId },
        select: { id: true },
      });
      if (!obj) throw new NotFoundException('数据源对象不存在或不属于当前应用');

      // ABAC 行级条件注入 — 调用方 filter 在此基础上收窄，无法越权放大范围
      const conditionWhere = this.buildConditionWhere(permissionContext);

      const dbRecords = await prisma.record.findMany({
        where: {
          tenantId,
          objectId: request.sourceId,
          ...(conditionWhere ? { AND: [conditionWhere] } : {}),
        },
        select: { data: true },
        take: CHART_DATA_MAX_ROWS,
      });
      return dbRecords.map((r) => r.data as Record<string, unknown>);
    }

    if (request.sourceType === 'dataset') {
      // 归属校验：数据集必须属于当前应用
      const dataset = await prisma.dataset.findFirst({
        where: { id: request.sourceId, tenantId, appId },
        select: { id: true },
      });
      if (!dataset) throw new NotFoundException('数据源数据集不存在或不属于当前应用');

      const dbRows = await prisma.datasetRow.findMany({
        where: { tenantId, datasetId: request.sourceId },
        select: { data: true },
        take: CHART_DATA_MAX_ROWS,
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
    categoryField: string | undefined,
    valueField: string | undefined,
    aggregation: ChartAggregation,
    timeGranularity: TimeGranularity | undefined,
  ): Array<{ category: string; value: number }> {
    const groups = new Map<string, number[]>();

    for (const record of records) {
      const category = this.resolveCategory(record, categoryField, timeGranularity);
      const value = aggregation === 'count' ? 1 : Number(record[valueField ?? ''] ?? 0);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(value);
    }

    let result = Array.from(groups.entries()).map(([category, values]) => {
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

    if (timeGranularity) {
      result = this.sortByTime(result);
    }

    return result;
  }

  /**
   * 解析分类标签。
   *
   * 无 categoryField 时返回标量分组标签。
   * 有 timeGranularity 时将字段值解析为日期并按粒度分桶。
   */
  private resolveCategory(
    record: Record<string, unknown>,
    categoryField: string | undefined,
    timeGranularity: TimeGranularity | undefined,
  ): string {
    if (!categoryField) {
      return SCALAR_CATEGORY;
    }

    const raw = record[categoryField];
    if (raw === null || raw === undefined || raw === '') {
      return '未知';
    }

    if (!timeGranularity) {
      return String(raw);
    }

    const date = this.parseDate(raw);
    if (!date) {
      return '未知';
    }

    return this.bucketTime(date, timeGranularity);
  }

  /**
   * 将各种日期格式解析为 Date 对象。
   * 支持 ISO 字符串、时间戳（毫秒）、Date 对象。
   */
  private parseDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  /**
   * 按时间粒度生成分桶标签。
   *
   * - day:   YYYY-MM-DD
   * - week:  YYYY-MM-DD（本周一日期）
   * - month: YYYY-MM
   */
  private bucketTime(date: Date, granularity: TimeGranularity): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const pad = (n: number) => String(n).padStart(2, '0');

    if (granularity === 'month') {
      return `${year}-${pad(month)}`;
    }

    if (granularity === 'week') {
      const monday = this.getMonday(date);
      return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    }

    // day
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /** 获取指定日期所在周的周一。 */
  private getMonday(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayOfWeek = d.getDay(); // 0=Sunday, 1=Monday...
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diff);
    return d;
  }

  /**
   * 按时间标签升序排序（最早 → 最晚）。
   * 标签格式为 YYYY-MM-DD 或 YYYY-MM，字典序即时间序。
   */
  private sortByTime(
    result: Array<{ category: string; value: number }>,
  ): Array<{ category: string; value: number }> {
    return result
      .filter((d) => d.category !== '未知')
      .sort((a, b) => a.category.localeCompare(b.category))
      .concat(result.filter((d) => d.category === '未知'));
  }
}
