/**
 * 对象元数据校验器（G3）。
 *
 * 校验对象建模元数据：apiName 规范、字段类型白名单（18 类型）、
 * 选择类字段 options 结构、自动编号格式、字段名唯一性。
 */

import type { SchemaIssue } from '@apaas/shared';
import { SCHEMA_ISSUE_CODES } from '@apaas/shared';

/** 平台支持的 18 种字段类型（packages/shared/src/object）。 */
const FIELD_TYPES: ReadonlySet<string> = new Set([
  'text',
  'long_text',
  'rich_text',
  'number',
  'currency',
  'percent',
  'auto_number',
  'single_select',
  'multi_select',
  'date',
  'date_time',
  'checkbox',
  'attachment',
  'user',
  'lookup',
  'sub_form',
  'formula',
  'rollup',
]);

const API_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_FIELDS = 200;

/** 校验对象元数据（apiName/name/fields）。 */
export function validateObjectMeta(meta: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isPlainObject(meta)) {
    issues.push({
      path: '',
      code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
      message: '对象元数据必须是对象',
      severity: 'error',
    });
    return issues;
  }

  const apiName = meta['apiName'];
  if (typeof apiName !== 'string' || !API_NAME_RE.test(apiName) || apiName.length > 40) {
    issues.push({
      path: 'apiName',
      code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
      message: `对象 apiName "${String(apiName)}" 非法：须为小写字母开头的 snake_case（≤40 字符），如 "contract"`,
      severity: 'error',
    });
  }
  if (typeof meta['name'] !== 'string' || (meta['name'] as string).length === 0) {
    issues.push({
      path: 'name',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '对象缺少显示名 name',
      severity: 'error',
    });
  }

  const fields = meta['fields'];
  if (!Array.isArray(fields)) {
    issues.push({
      path: 'fields',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '对象缺少 fields 数组',
      severity: 'error',
    });
    return issues;
  }
  if (fields.length > MAX_FIELDS) {
    issues.push({
      path: 'fields',
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `字段数超过上限 ${MAX_FIELDS}`,
      severity: 'error',
    });
  }

  const seen = new Set<string>();
  for (const [idx, f] of fields.entries()) {
    if (!isPlainObject(f)) {
      issues.push({
        path: `fields/${idx}`,
        code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
        message: '字段定义必须是对象',
        severity: 'error',
      });
      continue;
    }
    const fApi = f['apiName'];
    const fPath = `fields/${idx}`;
    if (typeof fApi !== 'string' || !API_NAME_RE.test(fApi) || fApi.length > 40) {
      issues.push({
        path: `${fPath}/apiName`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: `字段 apiName "${String(fApi)}" 非法：须为小写字母开头的 snake_case`,
        severity: 'error',
      });
    } else if (seen.has(fApi)) {
      issues.push({
        path: `${fPath}/apiName`,
        code: SCHEMA_ISSUE_CODES.DUPLICATE_KEY,
        message: `字段 apiName "${fApi}" 重复`,
        severity: 'error',
      });
    }
    if (typeof fApi === 'string') seen.add(fApi);

    const type = f['type'];
    if (typeof type !== 'string' || !FIELD_TYPES.has(type)) {
      issues.push({
        path: `${fPath}/type`,
        code: SCHEMA_ISSUE_CODES.UNKNOWN_TYPE,
        message: `字段类型 "${String(type)}" 不在平台 18 种支持类型内（text/long_text/rich_text/number/currency/percent/auto_number/single_select/multi_select/date/date_time/checkbox/attachment/user/lookup/sub_form/formula/rollup）`,
        severity: 'error',
      });
      continue;
    }

    const config = isPlainObject(f['config']) ? (f['config'] as Record<string, unknown>) : {};
    // 选择类字段必须带 options
    if ((type === 'single_select' || type === 'multi_select') && !optionsValid(config['options'])) {
      issues.push({
        path: `${fPath}/config.options`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: `选择类字段 "${String(fApi)}" 需要 options 数组（每项含 value 与 label）`,
        severity: 'error',
      });
    }
    // 自动编号必须带格式
    if (type === 'auto_number' && typeof config['format'] !== 'string') {
      issues.push({
        path: `${fPath}/config.format`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: `自动编号字段 "${String(fApi)}" 需要 config.format（如 "PO-{seq:0000}"）`,
        severity: 'error',
      });
    }
    // 公式字段建议带表达式（warning：可能由后续编辑补齐）
    if (type === 'formula' && typeof config['expression'] !== 'string') {
      issues.push({
        path: `${fPath}/config.expression`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: `公式字段 "${String(fApi)}" 缺少 config.expression`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

/** options 结构校验：非空数组，每项含 value 与 label。 */
function optionsValid(options: unknown): boolean {
  if (!Array.isArray(options) || options.length === 0) return false;
  return options.every(
    (o) => isPlainObject(o) && o['value'] !== undefined && typeof o['label'] === 'string',
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
