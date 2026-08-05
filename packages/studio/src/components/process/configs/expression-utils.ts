/**
 * 条件表达式工具 —— 可视化结构 ↔ 表达式字符串 转换 + 语法校验。
 *
 * expr-eval v2 语法约定：
 * - 逻辑运算符为小写 `and` / `or`（非 `&&` / `||` / `AND` / `OR`）
 * - 字符串值用双引号包裹：`status == "urgent"`
 * - 比较运算符：`>` `<` `>=` `<=` `==` `!=`
 *
 * 可视化模式仅支持扁平 AND/OR 组合（无括号嵌套）。
 * 含括号或混合 AND/OR 的表达式无法可视化，UI 自动回退到表达式模式。
 */

import { Parser } from 'expr-eval';

const parser = new Parser();

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ConditionRow {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'contains' | 'notContains';
  value: string;
  valueType: 'number' | 'string';
}

export interface VisualCondition {
  rows: ConditionRow[];
  combiner: 'AND' | 'OR';
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const OPERATOR_OPTIONS = [
  { label: '大于', value: '>' },
  { label: '小于', value: '<' },
  { label: '大于等于', value: '>=' },
  { label: '小于等于', value: '<=' },
  { label: '等于', value: '==' },
  { label: '不等于', value: '!=' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
];

export const COMBINER_OPTIONS = [
  { label: '并且 (AND)', value: 'AND' },
  { label: '或者 (OR)', value: 'OR' },
];

// ---------------------------------------------------------------------------
// 可视化 → 表达式
// ---------------------------------------------------------------------------

/**
 * 可视化结构 → 表达式字符串。
 * 生成 expr-eval 兼容语法（小写 and/or，字符串双引号）。
 *
 * 包含/不包含运算符转换为自定义函数调用：
 * - contains → contains(field, "value")
 * - notContains → notContains(field, "value")
 * 后端 evaluateCondition 需注册 contains/notContains 函数。
 */
export function visualToExpression(vc: VisualCondition): string {
  const op = vc.combiner === 'AND' ? 'and' : 'or';
  return vc.rows
    .map((r) => {
      const val = r.valueType === 'number' ? r.value : `"${r.value}"`;
      if (r.operator === 'contains') {
        return `contains(${r.field}, ${val})`;
      }
      if (r.operator === 'notContains') {
        return `notContains(${r.field}, ${val})`;
      }
      return `${r.field} ${r.operator} ${val}`;
    })
    .join(` ${op} `);
}

// ---------------------------------------------------------------------------
// 表达式 → 可视化
// ---------------------------------------------------------------------------

/**
 * 表达式字符串 → 可视化结构（best-effort）。
 *
 * 支持的格式：
 * - 单个比较：`amount > 1000`
 * - 扁平 AND：`amount > 1000 and status == "urgent"`
 * - 扁平 OR：`x == 1 or y == 2`
 *
 * 不支持的格式（返回 null，UI 回退到表达式模式）：
 * - 含括号嵌套：`(a > 1 or b < 2) and c == 3`
 * - 混合 AND/OR：`a > 1 and b < 2 or c == 3`
 * - 非比较表达式：`sin(x)`
 */
export function expressionToVisual(expr: string): VisualCondition | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  // 先把 contains(field, "value") / notContains(field, "value") 规范化为占位符
  // contains(field, "value") → field __contains__ "value"
  // notContains(field, "value") → field __notContains__ "value"
  const normalized = trimmed
    .replace(/contains\((\w+),\s*(.+?)\)/g, '$1 __contains__ $2')
    .replace(/notContains\((\w+),\s*(.+?)\)/g, '$1 __notContains__ $2');

  // 规范化后若仍含括号 → 无法可视化
  if (normalized.includes('(') || normalized.includes(')')) return null;

  // 按 ` and ` / ` or ` 分割（大小写不敏感）
  const andParts = normalized.split(/\s+and\s+/i);
  const orParts = normalized.split(/\s+or\s+/i);

  let combiner: 'AND' | 'OR';
  let parts: string[];

  if (andParts.length > 1 && orParts.length === 1) {
    combiner = 'AND';
    parts = andParts;
  } else if (orParts.length > 1 && andParts.length === 1) {
    combiner = 'OR';
    parts = orParts;
  } else if (andParts.length === 1 && orParts.length === 1) {
    combiner = 'AND';
    parts = [normalized];
  } else {
    return null;
  }

  const rows: ConditionRow[] = [];
  for (const part of parts) {
    const row = parseComparison(part.trim());
    if (!row) return null;
    rows.push(row);
  }

  return { rows, combiner };
}

/**
 * 解析单个比较表达式：`field operator value`。
 *
 * 支持标准比较运算符（> < >= <= == !=）和 contains/notContains 占位符。
 */
function parseComparison(str: string): ConditionRow | null {
  // 先尝试 contains/notContains 占位符
  const containsMatch = str.match(/^(\w+)\s*__contains__\s*(.+)$/);
  if (containsMatch && containsMatch[1] && containsMatch[3]) {
    const val = parseValue(containsMatch[3].trim());
    if (val) return { field: containsMatch[1], operator: 'contains', value: val.value, valueType: val.valueType };
  }
  const notContainsMatch = str.match(/^(\w+)\s*__notContains__\s*(.+)$/);
  if (notContainsMatch && notContainsMatch[1] && notContainsMatch[3]) {
    const val = parseValue(notContainsMatch[3].trim());
    if (val) return { field: notContainsMatch[1], operator: 'notContains', value: val.value, valueType: val.valueType };
  }

  // 匹配：字段名 + 运算符 + 值
  const match = str.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  const field = match[1];
  const operator = match[2] as ConditionRow['operator'];
  const val = parseValue(match[3].trim());
  if (!val) return null;

  return { field, operator, value: val.value, valueType: val.valueType };
}

/** 解析值字面量（双引号字符串 / 数字 / 单引号字符串）。 */
function parseValue(str: string): { value: string; valueType: 'number' | 'string' } | null {
  // 双引号字符串
  if (str.startsWith('"') && str.endsWith('"')) {
    return { value: str.slice(1, -1), valueType: 'string' };
  }
  // 单引号字符串（兼容）
  if (str.startsWith("'") && str.endsWith("'")) {
    return { value: str.slice(1, -1), valueType: 'string' };
  }
  // 数字
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return { value: str, valueType: 'number' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 语法校验
// ---------------------------------------------------------------------------

/**
 * 校验表达式语法是否合法（expr-eval 可解析）。
 */
export function validateExpression(expr: string): { valid: boolean; error?: string } {
  const trimmed = expr.trim();
  if (!trimmed) return { valid: true }; // 空表达式 = else/default

  try {
    parser.parse(trimmed);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}
