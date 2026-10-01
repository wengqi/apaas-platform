/**
 * 数据流执行引擎（G5 数据下沉）— pipeline 全量下推 PostgreSQL SQL。
 *
 * 执行流程：buildPipelineSql（每源 LIMIT 子查询 → COALESCE join → filter
 * WHERE → 聚合/输出映射）→ $queryRawUnsafe 一次取数 → 物化到 DatasetRow。
 * Node 内存中不再做 join 与聚合（此前每源拉 10k 行内存 hash join 的实现已删）。
 *
 * 兜底：filter 为不可下推的 JsonLogic 形状时——
 * - 非聚合分支：拉全量行 + 内存 jsonLogic 过滤（~15 行，保留求值语义）
 * - 聚合分支：显式 BadRequest（下推聚合必须可翻译 filter；preview 即时反馈）
 *
 * 行为语义对照（与旧内存引擎）见 docs/knowledge-base/DATASET-SQL-2026-10-01.md。
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { getEnvironmentId } from '@apaas/db';
import type { DataFlowConfig, DatasetColumn } from '@apaas/shared';
import { DATAFLOW_MAX_RESULT_ROWS, buildPipelineSql } from './dataflow-sql.js';

/** 评审 P1-3：刷新租约期——超过该时长的 REFRESHING 视为 worker 崩溃遗留 */
const DATASET_REFRESH_LEASE_MS = 10 * 60 * 1000;

/** pipeline 中间数据行（键为字段 apiName 或 alias_field 形式）。 */
type DataRow = Record<string, unknown>;

/** preview 返回的单行（data + 全量计数） */
interface PipelineRawRow {
  data: DataRow;
  __total?: number;
}

@Injectable()
export class DataFlowEngine {
  private readonly logger = new Logger(DataFlowEngine.name);

  /**
   * 执行数据流 pipeline（不物化，用于预览）。
   * 最多返回 100 行；total 为过滤/聚合后的全量行数。
   */
  async preview(
    tenantId: string,
    config: DataFlowConfig,
  ): Promise<{
    columns: DatasetColumn[];
    rows: DataRow[];
    total: number;
  }> {
    const { rows, total } = await this.runPipeline(tenantId, config, {
      limit: 100,
      includeTotal: true,
    });
    return { columns: this.buildColumns(config), rows, total };
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
    // 评审 P1-3：增加租约——worker 崩溃后 REFRESHING 永久卡死、后续刷新全部被跳过。
    // 超过租约期（10 分钟）仍未释放的 REFRESHING 视为孤儿，允许重新抢占。
    const leaseCutoff = new Date(Date.now() - DATASET_REFRESH_LEASE_MS);
    const claimed = await prisma.dataset.updateMany({
      where: {
        id: datasetId,
        OR: [
          { status: { not: 'REFRESHING' } },
          { status: 'REFRESHING', updatedAt: { lt: leaseCutoff } },
        ],
      },
      data: { status: 'REFRESHING', lastError: null },
    });
    if (claimed.count === 0) {
      this.logger.warn(`数据集 ${datasetId} 已在刷新中，跳过重复刷新`);
      return;
    }

    try {
      const { rows } = await this.runPipeline(tenantId, config, {
        limit: DATAFLOW_MAX_RESULT_ROWS,
      });
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
   * 执行 pipeline：SQL 下推取数（+ 不可下推 filter 的内存兜底）。
   */
  private async runPipeline(
    tenantId: string,
    config: DataFlowConfig,
    opts: { limit: number; includeTotal?: boolean },
  ): Promise<{ rows: DataRow[]; total: number }> {
    if (!config.sources?.length) {
      throw new BadRequestException('数据流配置缺少数据源');
    }

    const environmentId = getEnvironmentId() ?? 'prod';
    let sql = buildPipelineSql(config, { tenantId, environmentId, ...opts });

    // 不可下推 filter：全量拉取（安全上限）后内存过滤——保证预览 total 与
    // 物化行数与旧引擎一致；聚合分支直接报错（配置作者在 preview 即可见）
    if (!sql.filterPushedDown && config.filter) {
      if (config.aggregation) {
        throw new BadRequestException(
          '筛选条件包含暂不支持 SQL 下推的运算符，无法与分组汇总组合使用，请简化筛选条件',
        );
      }
      sql = buildPipelineSql(config, {
        tenantId,
        environmentId,
        limit: DATAFLOW_MAX_RESULT_ROWS,
        includeTotal: opts.includeTotal,
      });
    }

    const raw = await prisma.$queryRawUnsafe<PipelineRawRow[]>(sql.text, ...sql.values);
    let rows = raw.map((r) => r.data);

    if (!sql.filterPushedDown && config.filter) {
      rows = this.memoryFilter(rows, config.filter);
    }

    // includeTotal 时 SQL 已带全量计数（窗口函数在 LIMIT 前求值）；
    // 内存兜底路径的 total = 过滤后行数（与旧引擎 total 语义一致）
    const total = opts.includeTotal
      ? sql.filterPushedDown
        ? (raw[0]?.__total ?? 0)
        : rows.length
      : rows.length;
    return { rows, total };
  }

  /**
   * 内存过滤兜底（仅非聚合分支）：json-logic-js 逐行求值，异常 fail-open 保留行。
   */
  private memoryFilter(rows: DataRow[], filter: object): DataRow[] {
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
