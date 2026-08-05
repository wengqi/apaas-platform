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
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
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
 */
export function visualToExpression(vc: VisualCondition): string {
  const op = vc.combiner === 'AND' ? 'and' : 'or';
  return vc.rows
    .map((r) => {
      const val = r.valueType === 'number' ? r.value : `"${r.value}"`;
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

  // 含括号 → 无法可视化
  if (trimmed.includes('(') || trimmed.includes(')')) return null;

  // 按 ` and ` / ` or ` 分割（大小写不敏感）
  const andParts = trimmed.split(/\s+and\s+/i);
  const orParts = trimmed.split(/\s+or\s+/i);

  let combiner: 'AND' | 'OR';
  let parts: string[];

  if (andParts.length > 1 && orParts.length === 1) {
    // 纯 AND 组合
    combiner = 'AND';
    parts = andParts;
  } else if (orParts.length > 1 && andParts.length === 1) {
    // 纯 OR 组合
    combiner = 'OR';
    parts = orParts;
  } else if (andParts.length === 1 && orParts.length === 1) {
    // 单个条件（无组合）
    combiner = 'AND';
    parts = [trimmed];
  } else {
    // 混合 AND/OR → 无法可视化
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
 */
function parseComparison(str: string): ConditionRow | null {
  // 匹配：字段名 + 运算符 + 值
  const match = str.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  const field = match[1];
  const operator = match[2] as ConditionRow['operator'];
  const trimmedValue = match[3].trim();

  // 双引号字符串
  if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
    return {
      field,
      operator,
      value: trimmedValue.slice(1, -1),
      valueType: 'string',
    };
  }

  // 数字
  if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
    return {
      field,
      operator,
      value: trimmedValue,
      valueType: 'number',
    };
  }

  // 单引号字符串（兼容）
  if (trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) {
    return {
      field,
      operator,
      value: trimmedValue.slice(1, -1),
      valueType: 'string',
    };
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
