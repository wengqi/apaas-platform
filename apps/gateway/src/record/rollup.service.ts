/**
 * RollupService — 汇总（Rollup）字段计算与 Lookup 引用校验。
 *
 * Rollup 字段 = 关系字段（本对象上的 lookup / sub_form 字段）+ 聚合目标字段（关联对象上的字段）
 * + 聚合方式（sum/avg/count/min/max）。此前 Rollup 仅有类型定义、无任何计算路径（"死字段"）。
 *
 * 计算时机：
 *  1. 父记录写入（create/update）— 同步计算（lookup 关系基于本记录字段值即可解析；
 *     sub_form 关系在 create 时子记录尚未存在，结果为空，随后由 2 补算）
 *  2. 子记录写入（create/update/delete）— recomputeParentsForChildRecord 反向查找受影响的
 *     父记录并重算其 Rollup 字段（fire-and-forget，不阻塞子记录响应）
 *
 * Lookup 写约束：lookup 字段值（目标记录 ID）写入时校验目标记录存在且属于配置的目标对象，
 * 防止悬挂引用（此前的"无约束"状态）。
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import { FieldType } from '@apaas/shared';
import { FormulaEngine } from '../object/formula-engine.js';
import { NUMERIC_TEXT_RE } from '../dataset/jsonlogic-to-sql.js';

/** Rollup 字段配置（与 @apaas/shared FieldConfig 的 Rollup 分支一致）。 */
interface RollupFieldConfig {
  relationFieldId: string;
  targetFieldId?: string;
  aggregate: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

/** 关系字段（lookup / sub_form）的运行时视图。 */
interface RelationFieldView {
  id: string;
  apiName: string;
  type: 'lookup' | 'sub_form';
  /** lookup：目标对象 ID；sub_form：子对象 ID */
  targetObjectId: string;
  /** 仅 sub_form：子对象中指向父记录的 lookup 字段 ID */
  parentFieldId?: string;
}

/** 最小字段视图（record.service 的 ObjectField 结构兼容）。 */
interface FieldView {
  id: string;
  apiName: string;
  type: string;
  config: unknown;
}

@Injectable()
export class RollupService {
  constructor(private readonly formulaEngine: FormulaEngine) {}

  private readonly logger = new Logger(RollupService.name);

  // ===========================================================================
  // Lookup 写约束
  // ===========================================================================

  /**
   * 校验记录数据中 lookup 字段的值：目标记录必须存在且属于字段配置的目标对象。
   * 值形态：单值字符串 或 字符串数组（multi）。
   * 抛出 BadRequestException（400）携带明确字段名。
   */
  async validateLookupWrites(
    tenantId: string,
    fields: FieldView[],
    data: Record<string, unknown>,
  ): Promise<void> {
    const lookupFields = fields.filter((f) => f.type === FieldType.Lookup);
    if (lookupFields.length === 0) return;

    // 按 目标对象 分组，减少查询次数
    const idsByTarget = new Map<string, Set<string>>();
    for (const field of lookupFields) {
      const value = data[field.apiName];
      if (value === undefined || value === null || value === '') continue;

      const config = (field.config as { lookup?: { targetObjectId?: string } } | null) ?? {};
      const targetObjectId = config.lookup?.targetObjectId;
      if (!targetObjectId) continue;

      const ids = Array.isArray(value) ? value : [value];
      const bucket = idsByTarget.get(targetObjectId) ?? new Set<string>();
      for (const id of ids) {
        if (typeof id === 'string' && id.length > 0) bucket.add(id);
      }
      idsByTarget.set(targetObjectId, bucket);
    }

    for (const [targetObjectId, ids] of idsByTarget) {
      if (ids.size === 0) continue;
      const found = await prisma.record.count({
        where: { tenantId, objectId: targetObjectId, id: { in: [...ids] } },
      });
      if (found < ids.size) {
        throw new BadRequestException(
          `关联字段引用的记录不存在（对象 ${targetObjectId}，传入 ${ids.size} 个引用，仅找到 ${found} 条）`,
        );
      }
    }
  }

  // ===========================================================================
  // Rollup 计算
  // ===========================================================================

  /**
   * 计算记录的全部 Rollup 字段值。
   *
   * @param tenantId 租户
   * @param fields 本对象字段定义
   * @param recordData 记录数据（含 lookup 字段值）
   * @param recordId 记录 ID（sub_form 关系按它查子记录；create 前可传 undefined）
   * @returns { [rollupFieldApiName]: 聚合结果 }
   */
  async computeRollupFields(
    tenantId: string,
    fields: FieldView[],
    recordData: Record<string, unknown>,
    recordId?: string,
  ): Promise<Record<string, unknown>> {
    const rollupFields = fields.filter((f) => f.type === FieldType.Rollup);
    if (rollupFields.length === 0) return {};

    const results: Record<string, unknown> = {};
    for (const field of rollupFields) {
      const config = this.parseRollupConfig(field.config);
      if (!config) continue;
      try {
        results[field.apiName] = await this.computeOne(
          tenantId,
          fields,
          config,
          recordData,
          recordId,
        );
      } catch (err) {
        // 单个 Rollup 字段失败不阻断记录写入，记日志并置 null
        this.logger.warn(
          `Rollup 字段 ${field.apiName} 计算失败: ${err instanceof Error ? err.message : String(err)}`,
        );
        results[field.apiName] = null;
      }
    }
    return results;
  }

  /** 解析并校验 Rollup 字段配置。 */
  private parseRollupConfig(config: unknown): RollupFieldConfig | null {
    const cfg = (config as { rollup?: RollupFieldConfig } | null)?.rollup;
    if (!cfg?.relationFieldId || !cfg.aggregate) return null;
    if (cfg.aggregate !== 'count' && !cfg.targetFieldId) return null;
    return cfg;
  }

  /** 解析关系字段（lookup / sub_form）为统一视图；非关系字段返回 null。 */
  private resolveRelationField(
    fields: FieldView[],
    relationFieldId: string,
  ): RelationFieldView | null {
    const field = fields.find((f) => f.id === relationFieldId);
    if (!field) return null;

    if (field.type === FieldType.Lookup) {
      const config = (field.config as { lookup?: { targetObjectId?: string } } | null) ?? {};
      if (!config.lookup?.targetObjectId) return null;
      return {
        id: field.id,
        apiName: field.apiName,
        type: 'lookup',
        targetObjectId: config.lookup.targetObjectId,
      };
    }

    if (field.type === FieldType.SubForm) {
      const config =
        (field.config as { subForm?: { childObjectId?: string; parentFieldId?: string } } | null) ??
        {};
      if (!config.subForm?.childObjectId) return null;
      return {
        id: field.id,
        apiName: field.apiName,
        type: 'sub_form',
        targetObjectId: config.subForm.childObjectId,
        parentFieldId: config.subForm.parentFieldId,
      };
    }

    return null;
  }

  /** 计算单个 Rollup 字段。 */
  private async computeOne(
    tenantId: string,
    fields: FieldView[],
    config: RollupFieldConfig,
    recordData: Record<string, unknown>,
    recordId: string | undefined,
  ): Promise<number | null> {
    const relation = this.resolveRelationField(fields, config.relationFieldId);
    if (!relation) return null;

    // 解析聚合目标字段的 apiName（位于关联目标对象上；count 聚合可省略）
    const targetApiName = config.targetFieldId
      ? await this.resolveFieldApiName(tenantId, relation.targetObjectId, config.targetFieldId)
      : null;

    // 关联范围（SQL WHERE 片段的参数形态）
    let scope: { ids: string[] } | { parentEquals: { apiName: string; recordId: string } } | null =
      null;
    if (relation.type === 'lookup') {
      const value = recordData[relation.apiName];
      const ids = (Array.isArray(value) ? value : [value]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      if (ids.length === 0) return config.aggregate === 'count' ? 0 : null;
      scope = { ids };
    } else {
      if (!recordId || !relation.parentFieldId) {
        return config.aggregate === 'count' ? 0 : null;
      }
      const parentApiName = await this.resolveFieldApiName(
        tenantId,
        relation.targetObjectId,
        relation.parentFieldId,
      );
      if (!parentApiName) return config.aggregate === 'count' ? 0 : null;
      scope = { parentEquals: { apiName: parentApiName, recordId } };
    }

    // P1-24（用户裁决=数值聚合下推）：DB 内聚合（SUM/AVG/MIN/MAX 守卫 cast + COUNT），
    // 不再拉子记录全行内存归约——写延迟实测 44→99ms@3000 行线性劣化、批量导入 O(N²)。
    // SQL 失败（含 targetApiName 缺失的非 count 聚合）回退内存路径（防御兜底）。
    if ((config.aggregate === 'count' || targetApiName) && scope) {
      try {
        return await this.aggregateRelatedSql(
          tenantId,
          relation.targetObjectId,
          config.aggregate,
          targetApiName,
          scope,
        );
      } catch (err) {
        this.logger.warn(
          `Rollup SQL 聚合下推失败，回退内存路径: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 内存回退：拉子记录行后归约（语义与 SQL 路径一致：非数值不参与，空组 null/0）
    let relatedData: Record<string, unknown>[];
    if ('ids' in scope!) {
      relatedData = await this.fetchRecordsData(tenantId, relation.targetObjectId, {
        in: scope.ids,
      });
    } else {
      relatedData = await this.fetchRecordsData(tenantId, relation.targetObjectId, {
        equals: scope.parentEquals.recordId,
        path: scope.parentEquals.apiName,
      });
    }

    if (config.aggregate === 'count') return relatedData.length;
    if (relatedData.length === 0 || !targetApiName) return null;

    const values = relatedData
      .map((d) => d[targetApiName])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    switch (config.aggregate) {
      case 'sum':
        return values.reduce((acc, v) => acc + v, 0);
      case 'avg':
        return values.length > 0 ? values.reduce((acc, v) => acc + v, 0) / values.length : null;
      case 'min':
        return values.length > 0 ? Math.min(...values) : null;
      case 'max':
        return values.length > 0 ? Math.max(...values) : null;
      default:
        return null;
    }
  }

  /**
   * 关联记录的 DB 内聚合（P1-24）。守卫 cast 与 G5 metricInnerColumns 同款
   * （CASE WHEN data->>'f' ~ 数值正则 THEN ::numeric）——非数值不参与。
   * 空组语义：count→0，sum→0（内存版 values.reduce 空数组=0），avg/min/max→null。
   */
  private async aggregateRelatedSql(
    tenantId: string,
    objectId: string,
    aggregate: 'sum' | 'avg' | 'count' | 'min' | 'max',
    targetApiName: string | null,
    scope: { ids: string[] } | { parentEquals: { apiName: string; recordId: string } },
  ): Promise<number | null> {
    // 字段名内联 SQL 前白名单校验（元数据产物防御——与 record-query 同口径）
    const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (targetApiName && !FIELD_NAME_RE.test(targetApiName)) {
      throw new Error(`聚合目标字段名不合法: ${targetApiName}`);
    }
    if ('parentEquals' in scope && !FIELD_NAME_RE.test(scope.parentEquals.apiName)) {
      throw new Error(`父字段名不合法: ${scope.parentEquals.apiName}`);
    }
    const guarded = targetApiName
      ? `(CASE WHEN r.data->>'${targetApiName}' ~ '${NUMERIC_TEXT_RE}' THEN (r.data->>'${targetApiName}')::numeric END)`
      : null;
    let aggExpr: string;
    switch (aggregate) {
      case 'count':
        aggExpr = 'COUNT(*)';
        break;
      case 'sum':
        aggExpr = `COALESCE(SUM(${guarded}), 0)`;
        break;
      case 'avg':
        aggExpr = `SUM(${guarded}) / NULLIF(COUNT(${guarded}), 0)`;
        break;
      case 'min':
        aggExpr = `MIN(${guarded})`;
        break;
      default:
        aggExpr = `MAX(${guarded})`;
        break;
    }

    if ('ids' in scope) {
      const rows = await prisma.$queryRaw<Array<{ value: number | null }>>`
        SELECT ${Prisma.raw(aggExpr)} AS value FROM records r
        WHERE r.tenant_id = ${tenantId} AND r.object_id = ${objectId}
          AND r.id = ANY(${scope.ids}::text[])`;
      return this.coerceAggValue(rows[0]?.value ?? null, aggregate);
    }

    const containment = JSON.stringify({
      [scope.parentEquals.apiName]: scope.parentEquals.recordId,
    });
    const rows = await prisma.$queryRaw<Array<{ value: number | null }>>`
      SELECT ${Prisma.raw(aggExpr)} AS value FROM records r
      WHERE r.tenant_id = ${tenantId} AND r.object_id = ${objectId}
        AND r.data @> ${containment}::jsonb`;
    return this.coerceAggValue(rows[0]?.value ?? null, aggregate);
  }

  /** DB 聚合值的空组语义适配（与内存路径一致）。 */
  private coerceAggValue(
    value: number | null,
    aggregate: 'sum' | 'avg' | 'count' | 'min' | 'max',
  ): number | null {
    if (value !== null && Number.isFinite(Number(value))) return Number(value);
    return aggregate === 'count' || aggregate === 'sum' ? 0 : null;
  }

  /** 按条件取关联记录的 data（仅 select data，减小载荷）。 */
  private async fetchRecordsData(
    tenantId: string,
    objectId: string,
    condition: { in?: string[]; equals?: string; path?: string },
  ): Promise<Record<string, unknown>[]> {
    const where: Prisma.RecordWhereInput = { tenantId, objectId };
    if (condition.in) {
      where.id = { in: condition.in };
    } else if (condition.equals && condition.path) {
      // JSONB 路径等值：子记录 data[parentApiName] == 父记录 ID
      // P1-19：@> 包含形态命中 GIN（path+equals 为 Seq Scan）
      const containment = JSON.stringify({ [condition.path]: condition.equals });
      const rows = await prisma.$queryRaw<Array<{ data: unknown }>>`
        SELECT data FROM records
        WHERE tenant_id = ${tenantId} AND object_id = ${objectId}
          AND data @> ${containment}::jsonb`;
      return rows.map((r) => (r.data as Record<string, unknown>) ?? {});
    } else {
      return [];
    }
    const rows = await prisma.record.findMany({ where, select: { data: true } });
    return rows.map((r) => (r.data as Record<string, unknown>) ?? {});
  }

  /** 按字段 ID 解析对象上的字段 apiName。 */
  private async resolveFieldApiName(
    tenantId: string,
    objectId: string,
    fieldId: string,
  ): Promise<string | null> {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
      select: { fields: true },
    });
    if (!obj) return null;
    const fields = Array.isArray(obj.fields) ? (obj.fields as unknown as FieldView[]) : [];
    return fields.find((f) => f.id === fieldId)?.apiName ?? null;
  }

  // ===========================================================================
  // 子记录写入 → 反向重算父记录 Rollup
  // ===========================================================================

  /**
   * 子记录写入后，反向重算受影响父记录的 Rollup 字段。
   *
   * 反向关系来源（同应用内元数据扫描）：
   *  - 其他对象的 sub_form 字段指向本（子）对象 → 父记录 ID 直接取自子记录的 parentField 值
   *  - 其他对象的 lookup 字段指向本对象 → 按引用值反查父记录
   */
  async recomputeParentsForChildRecord(
    tenantId: string,
    appId: string,
    childObjectId: string,
    childRecordId: string,
    childRecordData: Record<string, unknown>,
  ): Promise<void> {
    const objects = await prisma.objectMeta.findMany({
      where: { tenantId, appId },
      select: { id: true, fields: true },
    });

    for (const obj of objects) {
      const fields = Array.isArray(obj.fields) ? (obj.fields as unknown as FieldView[]) : [];
      const rollupFields = fields.filter((f) => f.type === FieldType.Rollup);
      if (rollupFields.length === 0) continue;

      for (const field of rollupFields) {
        const config = this.parseRollupConfig(field.config);
        if (!config) continue;
        const relation = this.resolveRelationField(fields, config.relationFieldId);
        if (!relation || relation.targetObjectId !== childObjectId) continue;

        let parentIds: string[] = [];
        if (relation.type === 'sub_form') {
          // 父记录 ID 在子记录数据中
          if (relation.parentFieldId) {
            const parentApiName = await this.resolveFieldApiName(
              tenantId,
              childObjectId,
              relation.parentFieldId,
            );
            const pid = parentApiName ? childRecordData[parentApiName] : undefined;
            if (typeof pid === 'string' && pid.length > 0) parentIds = [pid];
          }
        } else {
          // lookup 反查：父记录的 lookup 值引用本子记录
          parentIds = await this.findParentsReferencing(
            tenantId,
            obj.id,
            relation.apiName,
            childRecordId,
          );
        }

        for (const parentId of parentIds) {
          await this.recomputeOneParent(tenantId, obj.id, fields, parentId);
        }
      }
    }
  }

  /**
   * 反查引用了指定子记录的父记录 ID（lookup 值 = 单值字符串 或 数组包含）。
   * P1-19：raw SQL @> 两形态 OR（`{"f": id}` 单值 / `{"f": [id]}` 数组子集）命中 GIN。
   */
  private async findParentsReferencing(
    tenantId: string,
    parentObjectId: string,
    lookupApiName: string,
    childRecordId: string,
  ): Promise<string[]> {
    const single = JSON.stringify({ [lookupApiName]: childRecordId });
    const arrayForm = JSON.stringify({ [lookupApiName]: [childRecordId] });
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM records
      WHERE tenant_id = ${tenantId} AND object_id = ${parentObjectId}
        AND (data @> ${single}::jsonb OR data @> ${arrayForm}::jsonb)`;
    return rows.map((r) => r.id);
  }

  /**
   * 重算单条父记录的计算字段（Rollup + Formula）并定向持久化。
   *
   * P1-05（用户裁决=字段定向写）：只 merge 计算字段（`data = data || $1::jsonb`），
   * 永不整份写回——旧实现以读时快照整份 update，并发人工修改的业务字段会被
   * 「业务字段陈旧 + 聚合字段新鲜」的混合副本无痕覆盖。
   * P1-10：rollup 先算，随后在同一份视图上补 formula 重算——公式引用 rollup
   * 字段时不再滞后一拍。
   */
  async recomputeOneParent(
    tenantId: string,
    parentObjectId: string,
    parentFields: FieldView[],
    parentRecordId: string,
  ): Promise<void> {
    const record = await prisma.record.findFirst({
      where: { id: parentRecordId, tenantId, objectId: parentObjectId },
      select: { data: true },
    });
    if (!record) return;

    const recordData = (record.data as Record<string, unknown>) ?? {};
    const rollupResults = await this.computeRollupFields(
      tenantId,
      parentFields,
      recordData,
      parentRecordId,
    );
    if (Object.keys(rollupResults).length === 0) return;

    const mergedView = { ...recordData, ...rollupResults };
    const formulaResults = this.formulaEngine.computeRecordFields(
      parentFields as unknown as import('@apaas/shared').Field[],
      mergedView,
    );

    // 定向 patch：仅计算字段（rollup ∪ formula），不含任何业务字段
    const patch = { ...rollupResults, ...formulaResults };
    const updated = await prisma.$executeRaw`
      UPDATE records SET data = data || ${JSON.stringify(patch)}::jsonb
      WHERE id = ${parentRecordId} AND tenant_id = ${tenantId}
    `;
    // $executeRaw 返回受影响行数（number）；兼容对象形态防御
    const affected =
      typeof updated === 'number' ? updated : ((updated as { count?: number }).count ?? 0);
    if (affected === 0) {
      this.logger.warn(`父记录 ${parentRecordId} Rollup 重算回写失败（记录不存在）`);
    }
  }
}
