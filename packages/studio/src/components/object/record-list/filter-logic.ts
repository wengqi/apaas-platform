/**
 * 记录列表 — 筛选/排序纯逻辑（从 RecordList.tsx 抽出，便于单测）。
 *
 * 职责：筛选行状态与 JsonLogic 规则的互转、按字段类型推导可用操作符、
 * 以及由「筛选行 + 全文搜索」构建查询用的 filter JSON 字符串。
 */

import type { FilterOperator } from '../../../api/objects.js';
import type { FieldType } from '../../../constants/fieldTypes.js';

/** 操作符 → 中文标签。 */
export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: '等于',
  ne: '不等于',
  contains: '包含',
  not_contains: '不包含',
  starts_with: '开头是',
  ends_with: '结尾是',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  is_empty: '为空',
  is_not_empty: '不为空',
  in: '属于',
  not_in: '不属于',
};

/** 无需输入值的操作符。 */
export const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty'];

/** 排序状态(field apiName + 方向)。 */
export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

/** 筛选行状态。 */
export interface FilterRow {
  field: string; // apiName
  operator: FilterOperator;
  value: unknown;
}

/**
 * 将单个筛选行转换为 JsonLogic 规则。
 * field 为字段 apiName，operator 为旧操作符名。
 */
export function filterRowToJsonLogic(
  field: string,
  operator: FilterOperator,
  value?: unknown,
): object {
  const varRef = { var: field };
  switch (operator) {
    case 'eq':
      return { '==': [varRef, value] };
    case 'ne':
      return { '!=': [varRef, value] };
    case 'contains':
      return { in: [String(value), varRef] };
    case 'not_contains':
      return { '!': { in: [String(value), varRef] } };
    case 'starts_with':
      return { in: [String(value), varRef] }; // 注: starts_with 简化为 contains，后端 JSONB 仅支持 string_contains
    case 'ends_with':
      return { in: [String(value), varRef] }; // 注: ends_with 简化为 contains
    case 'gt':
      return { '>': [varRef, value] };
    case 'gte':
      return { '>=': [varRef, value] };
    case 'lt':
      return { '<': [varRef, value] };
    case 'lte':
      return { '<=': [varRef, value] };
    case 'is_empty':
      return { '!': varRef };
    case 'is_not_empty':
      return { '!!': varRef };
    case 'in':
      return { in: [varRef, Array.isArray(value) ? value : [value]] };
    case 'not_in':
      return { '!': { in: [varRef, Array.isArray(value) ? value : [value]] } };
    default:
      return { '==': [varRef, value] };
  }
}

/**
 * 由「已应用的筛选行 + 全文搜索」构建 filter JSON 字符串（AND 组合）。
 * 无有效条件时返回 undefined（表示不过滤）。
 */
export function buildFilterStr(
  appliedFilter: FilterRow[],
  appliedSearch: string,
  firstTextField: { apiName: string } | undefined,
): string | undefined {
  const rules: object[] = [];

  // 全文搜索(对第一个文本字段 contains)
  if (appliedSearch && firstTextField) {
    rules.push({ in: [appliedSearch, { var: firstTextField.apiName }] });
  }

  // 筛选行(忽略无值且需要值的条件)
  for (const row of appliedFilter) {
    if (NO_VALUE_OPERATORS.includes(row.operator)) {
      rules.push(filterRowToJsonLogic(row.field, row.operator));
    } else if (row.value !== undefined && row.value !== '' && row.value !== null) {
      rules.push(filterRowToJsonLogic(row.field, row.operator, row.value));
    }
  }

  if (rules.length === 0) return undefined;
  // AND 组合所有条件
  const logic = rules.length === 1 ? rules[0]! : { and: rules };
  return JSON.stringify(logic);
}

// 操作符工具
// ---------------------------------------------------------------------------

/** 按字段类型返回可用操作符。 */
export function getOperatorsForType(type: FieldType): FilterOperator[] {
  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
    case 'auto_number':
      return [
        'eq',
        'ne',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ];
    case 'number':
    case 'currency':
    case 'percent':
      return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
    case 'single_select':
      return ['eq', 'ne', 'is_empty', 'is_not_empty', 'in'];
    case 'multi_select':
      return ['contains', 'is_empty', 'is_not_empty'];
    case 'date':
    case 'date_time':
      return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
    case 'checkbox':
      return ['eq'];
    default:
      return ['eq', 'ne', 'is_empty', 'is_not_empty'];
  }
}

/** 字段类型的默认操作符。 */
export function getDefaultOperator(type: FieldType): FilterOperator {
  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
    case 'auto_number':
      return 'contains';
    case 'multi_select':
      return 'contains';
    default:
      return 'eq';
  }
}

// ---------------------------------------------------------------------------
