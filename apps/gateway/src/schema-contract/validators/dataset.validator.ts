/**
 * 数据流（数据集）校验器（G3 第四类）。
 *
 * 校验 DataFlowConfig 结构化 pipeline：数据源/关联/筛选/分组汇总/输出列。
 * 范围界定（AI 主线第三轮 spike）：结构一致性校验（别名引用闭合、枚举值域、
 * 上限护栏）；字段存在性与 SQL 可下推性由引擎执行时报错（G5 已有显式错误）。
 * objectId 允许 @ref:object:<apiName> 令牌（治理层批准时解析）。
 */

import type { SchemaIssue } from '@apaas/shared';
import { SCHEMA_ISSUE_CODES } from '@apaas/shared';

const API_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** 最小子集护栏：单 JoinConfig 引擎语义决定最多双源。 */
const MAX_SOURCES = 2;
const MAX_OUTPUT_FIELDS = 50;

const AGG_FUNCTIONS: ReadonlySet<string> = new Set(['sum', 'count', 'avg', 'max', 'min']);
const JOIN_TYPES: ReadonlySet<string> = new Set(['left', 'inner']);
const COLUMN_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'date']);

/** 校验数据流草稿（apiName/name/config）。 */
export function validateDataset(draft: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isPlainObject(draft)) {
    issues.push({
      path: '',
      code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
      message: '数据流草稿必须是对象',
      severity: 'error',
    });
    return issues;
  }

  const apiName = draft['apiName'];
  if (typeof apiName !== 'string' || !API_NAME_RE.test(apiName) || apiName.length > 40) {
    issues.push({
      path: 'apiName',
      code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
      message: `数据流 apiName "${String(apiName)}" 非法：须为小写字母开头的 snake_case（≤40 字符）`,
      severity: 'error',
    });
  }
  if (typeof draft['name'] !== 'string' || (draft['name'] as string).length === 0) {
    issues.push({
      path: 'name',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '数据流缺少显示名 name',
      severity: 'error',
    });
  }

  const config = draft['config'];
  if (!isPlainObject(config)) {
    issues.push({
      path: 'config',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '数据流缺少 config 对象（pipeline 定义）',
      severity: 'error',
    });
    return issues;
  }

  // --- sources：1~2 个，alias 唯一 ---
  const sources = config['sources'];
  if (!Array.isArray(sources) || sources.length === 0) {
    issues.push({
      path: 'config.sources',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message:
        '数据流缺少数据源 sources 数组（每项 {objectId, alias}；objectId 可写 "@ref:object:<apiName>" 令牌）',
      severity: 'error',
    });
    return issues;
  }
  if (sources.length > MAX_SOURCES) {
    issues.push({
      path: 'config.sources',
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `数据源数量 ${sources.length} 超过当前上限 ${MAX_SOURCES}（引擎单 JoinConfig 语义）`,
      severity: 'error',
    });
  }
  const aliases = new Set<string>();
  for (const [idx, src] of sources.entries()) {
    const p = `config.sources/${idx}`;
    if (!isPlainObject(src)) {
      issues.push({
        path: p,
        code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
        message: '数据源必须是对象 {objectId, alias}',
        severity: 'error',
      });
      continue;
    }
    const objectId = src['objectId'];
    const isToken = typeof objectId === 'string' && /^@ref:object:[a-z][a-z0-9_]*$/.test(objectId);
    if (typeof objectId !== 'string' || (objectId.length === 0 && !isToken)) {
      issues.push({
        path: `${p}/objectId`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: '数据源缺少 objectId（真实对象 ID 或 "@ref:object:<apiName>" 令牌）',
        severity: 'error',
      });
    }
    const alias = src['alias'];
    if (typeof alias !== 'string' || !API_NAME_RE.test(alias)) {
      issues.push({
        path: `${p}/alias`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: `数据源别名 "${String(alias)}" 非法：须为小写字母开头的 snake_case（供关联与输出路径引用）`,
        severity: 'error',
      });
    } else if (aliases.has(alias)) {
      issues.push({
        path: `${p}/alias`,
        code: SCHEMA_ISSUE_CODES.DUPLICATE_KEY,
        message: `数据源别名 "${alias}" 重复`,
        severity: 'error',
      });
    } else {
      aliases.add(alias);
    }
  }

  // --- join：可选，别名必须落在 sources 内 ---
  const join = config['join'];
  if (join !== undefined && join !== null) {
    if (!isPlainObject(join)) {
      issues.push({
        path: 'config.join',
        code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
        message: 'join 必须是对象 {leftAlias, rightAlias, type, leftField, rightField}',
        severity: 'error',
      });
    } else {
      for (const key of ['leftAlias', 'rightAlias'] as const) {
        const v = join[key];
        if (typeof v !== 'string' || !aliases.has(v)) {
          issues.push({
            path: `config.join/${key}`,
            code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
            message: `join.${key} "${String(v)}" 未在 sources 别名中定义（可用：${[...aliases].join('、') || '无'}）`,
            severity: 'error',
          });
        }
      }
      if (typeof join['type'] !== 'string' || !JOIN_TYPES.has(join['type'])) {
        issues.push({
          path: 'config.join/type',
          code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
          message: `join.type "${String(join['type'])}" 非法：仅支持 left / inner`,
          severity: 'error',
        });
      }
      for (const key of ['leftField', 'rightField'] as const) {
        const v = join[key];
        if (typeof v !== 'string' || v.length === 0) {
          issues.push({
            path: `config.join/${key}`,
            code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
            message: `join.${key} 缺失（通常是 Lookup 字段 apiName 与关联对象主键字段）`,
            severity: 'error',
          });
        }
      }
    }
  }

  // --- aggregation：可选 ---
  const agg = config['aggregation'];
  const metricAliases = new Set<string>();
  if (agg !== undefined && agg !== null) {
    if (!isPlainObject(agg)) {
      issues.push({
        path: 'config.aggregation',
        code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
        message: 'aggregation 必须是对象 {groupBy, metrics}',
        severity: 'error',
      });
    } else {
      const groupBy = agg['groupBy'];
      if (
        !Array.isArray(groupBy) ||
        groupBy.length === 0 ||
        !groupBy.every((g) => typeof g === 'string' && g.length > 0)
      ) {
        issues.push({
          path: 'config.aggregation.groupBy',
          code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
          message: '分组汇总需要非空 groupBy 字符串数组（join 合并后的行键）',
          severity: 'error',
        });
      } else if (groupBy.some((g) => (g as string).includes('.'))) {
        issues.push({
          path: 'config.aggregation.groupBy',
          code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
          message: `groupBy 不支持点路径（收到 ${groupBy
            .filter((g) => (g as string).includes('.'))
            .join(
              '、',
            )}）：引用 join 合并行的键——左表字段用裸键，右表字段用 "{rightAlias}_<字段>" 前缀键（如右表别名 suppliers 的 name 字段写 "suppliers_name"）`,
          severity: 'error',
        });
      }
      const metrics = agg['metrics'];
      if (!Array.isArray(metrics) || metrics.length === 0) {
        issues.push({
          path: 'config.aggregation.metrics',
          code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
          message: '分组汇总需要非空 metrics 数组（{alias, label, field, function}）',
          severity: 'error',
        });
      } else {
        for (const [idx, m] of metrics.entries()) {
          const p = `config.aggregation.metrics/${idx}`;
          if (!isPlainObject(m)) {
            issues.push({
              path: p,
              code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
              message: '聚合指标必须是对象',
              severity: 'error',
            });
            continue;
          }
          if (typeof m['alias'] !== 'string' || !API_NAME_RE.test(m['alias'])) {
            issues.push({
              path: `${p}/alias`,
              code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
              message: `聚合指标别名 "${String(m['alias'])}" 非法：须为 snake_case（作为输出列名）`,
              severity: 'error',
            } satisfies SchemaIssue);
          } else {
            metricAliases.add(m['alias']);
          }
          if (typeof m['label'] !== 'string' || m['label'].length === 0) {
            issues.push({
              path: `${p}/label`,
              code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
              message: '聚合指标缺少显示名 label',
              severity: 'error',
            });
          }
          if (typeof m['field'] !== 'string' || m['field'].length === 0) {
            issues.push({
              path: `${p}/field`,
              code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
              message: '聚合指标缺少源字段 field',
              severity: 'error',
            });
          } else if (m['field'].includes('.')) {
            issues.push({
              path: `${p}/field`,
              code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
              message: `聚合指标 field "${m['field']}" 不支持点路径：引用 join 合并行的键——左表字段用裸键（如 "amount"），右表字段用 "{rightAlias}_<字段>" 前缀键`,
              severity: 'error',
            });
          }
          if (typeof m['function'] !== 'string' || !AGG_FUNCTIONS.has(m['function'])) {
            issues.push({
              path: `${p}/function`,
              code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
              message: `聚合函数 "${String(m['function'])}" 非法：仅支持 sum/count/avg/max/min`,
              severity: 'error',
            });
          }
        }
      }
    }
  }

  // --- outputFields：必填，source 路径必须可解析 ---
  const outputFields = config['outputFields'];
  if (!Array.isArray(outputFields) || outputFields.length === 0) {
    issues.push({
      path: 'config.outputFields',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '数据流缺少输出列 outputFields 数组（{alias, label, source, type}）',
      severity: 'error',
    });
    return issues;
  }
  if (outputFields.length > MAX_OUTPUT_FIELDS) {
    issues.push({
      path: 'config.outputFields',
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `输出列数超过上限 ${MAX_OUTPUT_FIELDS}`,
      severity: 'error',
    });
  }
  const outAliases = new Set<string>();
  for (const [idx, f] of outputFields.entries()) {
    const p = `config.outputFields/${idx}`;
    if (!isPlainObject(f)) {
      issues.push({
        path: p,
        code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
        message: '输出列必须是对象 {alias, label, source, type}',
        severity: 'error',
      });
      continue;
    }
    const alias = f['alias'];
    if (typeof alias !== 'string' || !API_NAME_RE.test(alias)) {
      issues.push({
        path: `${p}/alias`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: `输出列别名 "${String(alias)}" 非法：须为 snake_case`,
        severity: 'error',
      });
    } else if (outAliases.has(alias)) {
      issues.push({
        path: `${p}/alias`,
        code: SCHEMA_ISSUE_CODES.DUPLICATE_KEY,
        message: `输出列别名 "${alias}" 重复`,
        severity: 'error',
      });
    } else {
      outAliases.add(alias);
    }
    if (typeof f['label'] !== 'string' || f['label'].length === 0) {
      issues.push({
        path: `${p}/label`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: '输出列缺少显示名 label',
        severity: 'error',
      });
    }
    // source 路径："<源别名>.<字段>" 或聚合指标别名（无 aggregation 时仅前者）
    const source = f['source'];
    let sourceOk = false;
    if (typeof source === 'string' && source.length > 0) {
      if (metricAliases.has(source)) {
        sourceOk = true;
      } else {
        const dot = source.indexOf('.');
        const prefix = dot > 0 ? source.slice(0, dot) : source;
        sourceOk = aliases.has(prefix) && dot > 0;
      }
    }
    if (!sourceOk) {
      const valid = [...[...aliases].map((a) => `${a}.<字段>`), ...metricAliases].join('、');
      issues.push({
        path: `${p}/source`,
        code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
        message: `输出列 source "${String(source)}" 无法解析：须为 "<数据源别名>.<字段apiName>" 或聚合指标别名（可用：${valid || '无'}）`,
        severity: 'error',
      });
    }
    if (typeof f['type'] !== 'string' || !COLUMN_TYPES.has(f['type'])) {
      issues.push({
        path: `${p}/type`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: `输出列类型 "${String(f['type'])}" 非法：仅支持 string/number/date`,
        severity: 'error',
      });
    }
  }

  return issues;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
