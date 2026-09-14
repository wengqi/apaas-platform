/**
 * 数据流执行引擎 — 将数据流配置转换为实际查询和聚合，物化结果到数据集。
 *
 * 执行流程：加载源数据 → 内存 join → filter → aggregation → 输出映射 → 物化。
 * 复用 jsonLogicToPrismaWhere 做筛选，内存 join 处理跨对象关联。
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type {
  DataFlowConfig,
  DataSourceConfig,
  JoinConfig,
  AggregationConfig,
  OutputFieldConfig,
  DatasetColumn,
} from '@apaas/shared';

/** pipeline 中间数据行（键为字段 apiName 或 alias.field 形式）。 */
type DataRow = Record<string, unknown>;

/** 数据流单次加载源数据的最大行数（B7：防止大对象 OOM）。 */
const DATAFLOW_MAX_ROWS = 10000;

@Injectable()
export class DataFlowEngine {
  private readonly logger = new Logger(DataFlowEngine.name);

  /**
   * 执行数据流 pipeline（不物化，用于预览）。
   * 限制最多返回 100 行。
   */
  async preview(
    tenantId: string,
    config: DataFlowConfig,
  ): Promise<{
    columns: DatasetColumn[];
    rows: DataRow[];
    total: number;
  }> {
    const allRows = await this.executePipeline(config, tenantId);
    const columns = this.buildColumns(config);
    const rows = allRows.slice(0, 100);
    return { columns, rows, total: allRows.length };
  }

  /**
   * 执行数据流 pipeline 并物化结果到数据集。
   * 由 BullMQ worker 调用。
   */
  async executeAndMaterialize(
    tenantId: string,
    datasetId: string,
    config: DataFlowConfig,
  ): Promise<void> {
    // B6 修复：REFRESHING 守卫 — 防止并发刷新交错。
    // 原子更新：仅当当前状态不是 REFRESHING 时才置为 REFRESHING。
    const claimed = await prisma.dataset.updateMany({
      where: { id: datasetId, status: { not: 'REFRESHING' } },
      data: { status: 'REFRESHING', lastError: null },
    });
    if (claimed.count === 0) {
      this.logger.warn(`数据集 ${datasetId} 已在刷新中，跳过重复刷新`);
      return;
    }

    try {
      const rows = await this.executePipeline(config, tenantId);
      const columns = this.buildColumns(config);

      await this.materialize(datasetId, tenantId, rows, columns);

      await prisma.dataset.update({
        where: { id: datasetId },
        data: {
          status: 'READY',
          rowCount: rows.length,
          columns: columns as object,
          lastRefreshedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(`数据集 ${datasetId} 刷新完成: ${rows.length} 行`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`数据集 ${datasetId} 刷新失败: ${errMsg}`);
      await prisma.dataset.update({
        where: { id: datasetId },
        data: { status: 'FAILED', lastError: errMsg },
      });
      throw err;
    }
  }

  /**
   * 执行完整 pipeline，返回结果行数组。
   */
  private async executePipeline(config: DataFlowConfig, tenantId: string): Promise<DataRow[]> {
    if (!config.sources?.length) {
      throw new BadRequestException('数据流配置缺少数据源');
    }

    // 1. 加载源数据
    const sourceDataMap = new Map<string, DataRow[]>();
    for (const source of config.sources) {
      const data = await this.loadSourceData(tenantId, source);
      sourceDataMap.set(source.alias, data);
    }

    // 2. 执行 join（如果有）
    let rows: DataRow[];
    if (config.join && config.sources.length >= 2) {
      rows = this.executeJoin(sourceDataMap, config.join);
    } else {
      // 无 join：直接使用第一个数据源
      const firstAlias = config.sources[0]!.alias;
      rows = (sourceDataMap.get(firstAlias) ?? []).map((r) => ({ ...r }));
    }

    // 3. 执行 filter（如果有）— 在内存中过滤
    if (config.filter) {
      rows = this.executeFilter(rows, config.filter);
    }

    // 4. 执行 aggregation（如果有）
    if (config.aggregation) {
      rows = this.executeAggregation(rows, config.aggregation);
    }

    // 5. 映射输出字段
    rows = this.mapOutputFields(rows, config.outputFields);

    return rows;
  }

  /**
   * 从 Record 表加载源数据。
   *
   * B7 修复：添加 take 上限，防止大对象 OOM（与 chart-data 的 10000 上限一致）。
   */
  private async loadSourceData(tenantId: string, source: DataSourceConfig): Promise<DataRow[]> {
    const records = await prisma.record.findMany({
      where: { tenantId, objectId: source.objectId },
      select: { data: true },
      take: DATAFLOW_MAX_ROWS,
    });
    return records.map((r) => r.data as DataRow);
  }

  /**
   * 内存 join：遍历左表，在右表中查找匹配记录，合并字段。
   */
  private executeJoin(sourceDataMap: Map<string, DataRow[]>, join: JoinConfig): DataRow[] {
    const leftData = sourceDataMap.get(join.leftAlias) ?? [];
    const rightData = sourceDataMap.get(join.rightAlias) ?? [];

    // 构建右表索引：rightField 值 → 行
    const rightIndex = new Map<string, DataRow[]>();
    for (const row of rightData) {
      const key = String(row[join.rightField] ?? '');
      if (!rightIndex.has(key)) rightIndex.set(key, []);
      rightIndex.get(key)!.push(row);
    }

    const result: DataRow[] = [];
    for (const leftRow of leftData) {
      const leftValue = String(leftRow[join.leftField] ?? '');
      const matches = rightIndex.get(leftValue);

      if (matches && matches.length > 0) {
        for (const rightRow of matches) {
          // 合并：右表字段加前缀 `${rightAlias}_`
          const merged: DataRow = { ...leftRow };
          for (const [key, value] of Object.entries(rightRow)) {
            merged[`${join.rightAlias}_${key}`] = value;
          }
          result.push(merged);
        }
      } else if (join.type === 'left') {
        // left join：保留左表行，右表字段为 null
        result.push({ ...leftRow });
      }
    }

    return result;
  }

  /**
   * 在内存中执行筛选（JsonLogic 规则）。
   * 使用 json-logic-js 在应用层评估。
   */
  private executeFilter(rows: DataRow[], filter: object): DataRow[] {
    // 简化实现：对于复杂的 JsonLogic 规则，使用 json-logic-js 评估
    // 这里用 jsonLogicToPrismaWhere 不适用（它是 Prisma 翻译器，不是求值器）
    // 改为逐行评估
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jsonLogic = require('json-logic-js');
    return rows.filter((row) => {
      try {
        return Boolean(jsonLogic.apply(filter, row));
      } catch {
        return true; // 评估失败时保留行
      }
    });
  }

  /**
   * 分组汇总：按 groupBy 分组，对每组计算 metrics。
   */
  private executeAggregation(rows: DataRow[], agg: AggregationConfig): DataRow[] {
    const groups = new Map<string, DataRow[]>();

    for (const row of rows) {
      const groupKey = agg.groupBy.map((field) => String(row[field] ?? '')).join('\x00');
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(row);
    }

    const result: DataRow[] = [];
    for (const [, groupRows] of groups) {
      const outputRow: DataRow = {};
      const firstRow = groupRows[0]!;

      // 输出分组字段
      for (const field of agg.groupBy) {
        outputRow[field] = firstRow[field];
      }

      // 计算聚合指标
      for (const metric of agg.metrics) {
        const values = groupRows.map((r) => Number(r[metric.field])).filter((v) => !isNaN(v));

        let result: number;
        switch (metric.function) {
          case 'count':
            result = groupRows.length;
            break;
          case 'sum':
            result = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            result = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            break;
          case 'max':
            result = values.length > 0 ? Math.max(...values) : 0;
            break;
          case 'min':
            result = values.length > 0 ? Math.min(...values) : 0;
            break;
          default:
            result = 0;
        }
        outputRow[metric.alias] = Math.round(result * 100) / 100;
      }

      result.push(outputRow);
    }

    return result;
  }

  /**
   * 按输出字段映射：从源行中提取指定字段，重命名为 alias。
   */
  private mapOutputFields(rows: DataRow[], outputFields: OutputFieldConfig[]): DataRow[] {
    return rows.map((row) => {
      const output: DataRow = {};
      for (const field of outputFields) {
        // source 可能是 "alias.field" 或直接 "field"
        const sourceParts = field.source.split('.');
        if (sourceParts.length === 2) {
          // "alias.field" → 先尝试 `${alias}_${field}`（join 后的格式），再尝试 `field`
          const joinedKey = `${sourceParts[0]}_${sourceParts[1]}`;
          output[field.alias] = row[joinedKey] ?? row[sourceParts[1]!] ?? null;
        } else {
          output[field.alias] = row[field.source] ?? null;
        }
      }
      return output;
    });
  }

  /**
   * 从配置构建列定义。
   */
  private buildColumns(config: DataFlowConfig): DatasetColumn[] {
    // 如果有 aggregation，列 = groupBy 字段 + metrics
    if (config.aggregation) {
      const columns: DatasetColumn[] = [];
      for (const field of config.aggregation.groupBy) {
        const outputField = config.outputFields.find((f) => f.source === field);
        columns.push({
          apiName: outputField?.alias ?? field,
          label: outputField?.label ?? field,
          type: outputField?.type ?? 'string',
          source: field,
        });
      }
      for (const metric of config.aggregation.metrics) {
        columns.push({
          apiName: metric.alias,
          label: metric.label,
          type: 'number',
          source: metric.field,
        });
      }
      return columns;
    }

    // 无 aggregation：直接从 outputFields 构建
    return config.outputFields.map((f) => ({
      apiName: f.alias,
      label: f.label,
      type: f.type,
      source: f.source,
    }));
  }

  /**
   * 物化结果到 DatasetRow 表。
   */
  /**
   * 物化数据到 DatasetRow 表。
   *
   * B6 修复：
   * - $transaction 包裹 deleteMany + createMany，中途崩溃不会留下空数据集
   * - 此前无事务：deleteMany 后崩溃 → 数据集永久为空；重复刷新并发交错
   */
  private async materialize(
    datasetId: string,
    tenantId: string,
    rows: DataRow[],
    _columns: DatasetColumn[],
  ): Promise<void> {
    const BATCH_SIZE = 500;

    // 在事务中执行：先删旧行再写新行，保证原子性
    await prisma.$transaction(async (tx) => {
      await tx.datasetRow.deleteMany({ where: { datasetId } });

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await tx.datasetRow.createMany({
          data: batch.map((row) => ({
            tenantId,
            datasetId,
            data: row as object,
          })),
        });
      }
    });
  }
}
