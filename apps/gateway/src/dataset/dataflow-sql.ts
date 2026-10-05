/**
 * 数据流 pipeline → PostgreSQL SQL 构建器（G5 数据下沉，纯函数）。
 *
 * 结构：每源 LIMIT 子查询 → COALESCE join（复刻内存引擎 String(v ?? '') 键
 * 规范化）→ 合并行 JSONB（左字段裸键 + 右字段 `{rightAlias}_` 前缀）→
 * filter（可下推时 WHERE）→ 聚合（GROUP BY + regex 守卫 cast 指标）或输出
 * 映射（jsonb_build_object）→ 结果 LIMIT。
 *
 * 语义对齐细节见知识库 G5 记录；标识符全部白名单校验后内联，值全部参数绑定。
 */

import type {
  AggregationConfig,
  DataFlowConfig,
  JoinConfig,
  OutputFieldConfig,
} from '@apaas/shared';
import { BadRequestException } from '@nestjs/common';
import { NUMERIC_TEXT_RE, translateJsonLogicToSql } from './jsonlogic-to-sql.js';

/** 单数据源最大加载行数（与旧内存引擎 DATAFLOW_MAX_ROWS 语义一致） */
export const DATAFLOW_MAX_SOURCE_ROWS = 10000;

/** 物化结果安全上限（join 展开防护；旧引擎受源上限间接约束，此处显式化） */
export const DATAFLOW_MAX_RESULT_ROWS = 100000;

/** 别名/标识符白名单（内联进 SQL 前必须通过） */
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

/** 输出行形态：data 列 + preview 时的总数列 */
export interface PipelineSql {
  text: string;
  values: unknown[];
  /** filter 是否已下推 WHERE（false 时非聚合分支由引擎内存过滤兜底） */
  filterPushedDown: boolean;
}

export interface BuildOptions {
  /** 结果 LIMIT（preview=100，refresh=安全上限） */
  limit: number;
  /** preview 附带 `COUNT(*) OVER ()` 全量计数（供 total 展示） */
  includeTotal?: boolean;
}

/** 校验并内联标识符（别名/字段键） */
function ident(name: string, kind: string): string {
  if (!IDENT_RE.test(name)) {
    throw new BadRequestException(`数据流配置的${kind}不合法: "${name}"（仅允许字母/数字/下划线）`);
  }
  return name;
}

/** 单源子查询：显式租户+环境过滤（raw SQL 不经 $extends） */
function sourceSubquery(alias: string, objectIdParam: string): string {
  return `(SELECT r.data FROM records r
           WHERE r.tenant_id = $1 AND r.environment_id = $2 AND r.object_id = ${objectIdParam}
           LIMIT ${DATAFLOW_MAX_SOURCE_ROWS}) AS q_${ident(alias, '别名')} (data)`;
}

/** 输出映射的 COALESCE 值表达式（复刻 joinedKey → bare → null 双路径） */
function outputValueExpr(field: OutputFieldConfig): string {
  const parts = field.source.split('.');
  if (parts.length === 2) {
    const joinedKey = ident(`${parts[0]}_${parts[1]}`, '字段键');
    const bareKey = ident(parts[1]!, '字段键');
    return `COALESCE(d.data->'${joinedKey}', d.data->'${bareKey}')`;
  }
  const key = ident(field.source, '字段键');
  return `d.data->'${key}'`;
}

/** 聚合指标的 SQL 表达式（regex 守卫 cast：非数值不参与，空组 COALESCE 0；内列按位置索引命名，容忍字段键含点） */
function metricExpr(index: number, agg: AggregationConfig): string {
  const metric = agg.metrics[index]!;
  const s = `__s_${index}`,
    c = `__c_${index}`,
    mx = `__mx_${index}`,
    mn = `__mn_${index}`;
  switch (metric.function) {
    case 'count':
      return `__cnt`;
    case 'sum':
      return `ROUND(COALESCE(${s}, 0), 2)`;
    case 'avg':
      return `ROUND(COALESCE(${s} / NULLIF(${c}, 0), 0), 2)`;
    case 'max':
      return `ROUND(COALESCE(${mx}, 0), 2)`;
    case 'min':
      return `ROUND(COALESCE(${mn}, 0), 2)`;
    default:
      throw new BadRequestException(`不支持的聚合函数: ${metric.function}`);
  }
}

/** 聚合内层 SELECT 的指标原始列（SUM/COUNT/MAX/MIN 守卫 cast） */
function metricInnerColumns(agg: AggregationConfig): string[] {
  const cols: string[] = ['COUNT(*) AS __cnt'];
  agg.metrics.forEach((m, i) => {
    const key = ident(m.field, '字段键');
    const num = `(CASE WHEN d.data->>'${key}' ~ '${NUMERIC_TEXT_RE}' THEN (d.data->>'${key}')::numeric END)`;
    if (m.function === 'sum' || m.function === 'avg') {
      cols.push(`SUM(${num}) AS __s_${i}`);
      cols.push(`COUNT(${num}) AS __c_${i}`);
    }
    if (m.function === 'max') cols.push(`MAX(${num}) AS __mx_${i}`);
    if (m.function === 'min') cols.push(`MIN(${num}) AS __mn_${i}`);
  });
  return cols;
}

/**
 * 构建数据流 pipeline 的查询 SQL。
 *
 * @throws BadRequestException 配置不合法（缺数据源/别名非法/聚合别名冲突）
 */
export function buildPipelineSql(
  config: DataFlowConfig,
  opts: BuildOptions & { tenantId: string; environmentId: string },
): PipelineSql {
  if (!config.sources?.length) {
    throw new BadRequestException('数据流配置缺少数据源');
  }
  const values: unknown[] = [opts.tenantId, opts.environmentId];
  let p = 2; // $1 tenant, $2 env

  // 1. 数据源子查询（每源 LIMIT，等价旧 DATAFLOW_MAX_ROWS）
  const aliases = new Set<string>();
  const sourceSqls = config.sources.map((source) => {
    if (aliases.has(source.alias)) {
      throw new BadRequestException(`数据源别名重复: ${source.alias}`);
    }
    aliases.add(ident(source.alias, '别名'));
    p += 1;
    const objectIdParam = `$${p}`;
    values.push(source.objectId);
    return sourceSubquery(source.alias, objectIdParam);
  });

  // 2. join（单 join，最多两表；类型 inner|left）
  let baseSelect: string;
  const join: JoinConfig | undefined = config.join;
  if (join && config.sources.length >= 2) {
    const left = ident(join.leftAlias, '别名');
    const right = ident(join.rightAlias, '别名');
    if (!aliases.has(left) || !aliases.has(right)) {
      throw new BadRequestException(`join 引用了不存在的数据源别名: ${left}/${right}`);
    }
    const leftField = ident(join.leftField, '字段键');
    const rightField = ident(join.rightField, '字段键');
    const joinType = join.type === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
    // 右表字段加 `{rightAlias}_` 前缀（复刻内存引擎合并键），缺失行聚合为空对象。
    // 引擎修复（AI 主线第三轮实测）：sourceSqls 已含 "AS q_<alias> (data)" 表别名，
    // 不能再叠加 l/r 短别名（PG 语法错误 42601）——直接引用 q_<alias>.data
    baseSelect = `SELECT (COALESCE(${ident(`q_${left}`, '别名')}.data, '{}'::jsonb) || COALESCE(rp.prefixed, '{}'::jsonb)) AS data
FROM ${sourceSqls[config.sources.findIndex((s) => s.alias === left)]!}
${joinType} ${sourceSqls[config.sources.findIndex((s) => s.alias === right)]!}
  ON COALESCE(${ident(`q_${left}`, '别名')}.data->>'${leftField}', '') = COALESCE(${ident(`q_${right}`, '别名')}.data->>'${rightField}', '')
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg('${right}_' || key, value) AS prefixed
  FROM jsonb_each(${ident(`q_${right}`, '别名')}.data) e(key, value)
) rp ON TRUE`;
  } else {
    baseSelect = `SELECT data FROM ${sourceSqls[0]!}`;
  }

  // 3. filter（可下推则 WHERE；否则由调用方内存兜底）
  let filterWhere = '';
  let filterPushedDown = true;
  if (config.filter) {
    const frag = translateJsonLogicToSql(config.filter, 'data', p);
    if (frag) {
      filterWhere = `WHERE ${frag.text}`;
      values.push(...frag.params);
    } else {
      filterPushedDown = false;
    }
  }

  // 4. 输出（聚合分组 or 输出映射）+ 结果 LIMIT
  let resultSelect: string;
  if (config.aggregation) {
    const agg = config.aggregation;
    if (agg.groupBy.length === 0 || agg.metrics.length === 0) {
      throw new BadRequestException('分组汇总配置缺少 groupBy 或 metrics');
    }
    const groupKeys = agg.groupBy.map((g) => ident(g, '字段键'));
    const groupTextKeys = groupKeys.map((g) => `d.data->>'${g}'`);
    // jsonb 无 MIN 聚合：组内文本值相同（GROUP BY 文本键），array_agg 取一保原始 JSON 类型
    const groupInnerCols = groupKeys.map((g, i) => `(array_agg(d.data->'${g}'))[1] AS __g_${i}`);
    const objEntries = [
      ...agg.groupBy.map((g, i) => `'${ident(g, '字段键')}', d.__g_${i}`),
      ...agg.metrics.map((m, i) => `'${ident(m.alias, '指标别名')}', ${metricExpr(i, agg)}`),
    ];
    resultSelect = `SELECT jsonb_build_object(${objEntries.join(', ')}) AS data
FROM (
  SELECT ${[...groupInnerCols, ...metricInnerColumns(agg)].join(', ')}
  FROM filtered d
  GROUP BY ${groupTextKeys.join(', ')}
) d`;
  } else {
    const objEntries = config.outputFields.map(
      (f) => `'${ident(f.alias, '输出列')}', ${outputValueExpr(f)}`,
    );
    resultSelect = `SELECT jsonb_build_object(${objEntries.join(', ')}) AS data
FROM filtered d`;
  }

  const totalCol = opts.includeTotal ? `, COUNT(*) OVER ()::int AS __total` : '';
  const text = `WITH joined AS (
  ${baseSelect}
), filtered AS (
  SELECT data FROM joined ${filterWhere}
)
SELECT data${totalCol} FROM (
  ${resultSelect}
) d
LIMIT ${Math.floor(opts.limit)}`;

  return { text, values, filterPushedDown };
}
