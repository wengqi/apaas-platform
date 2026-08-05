/**
 * JsonLogic 工具函数 —— 表达式文本 ↔ JsonLogic JSON 转换 + 求值/校验。
 *
 * JsonLogic 是一种跨语言的逻辑序列化标准（jsonlogic.com）：
 * - 安全：无 eval、无副作用、确定性计算
 * - 可序列化：原生 JSON，可存储到数据库
 * - 跨语言：JS / Python / Java / PHP / Ruby / Go
 *
 * 表达式语法（expr-eval 兼容）：
 * - 逻辑运算符小写 `and` / `or`
 * - 字符串双引号：`status == "urgent"`
 * - 比较运算符：`>` `<` `>=` `<=` `==` `!=`
 * - 包含：`contains(field, "value")` / `notContains(field, "value")`
 *
 * 转换规则：
 * | 表达式                        | JsonLogic                                          |
 * |-------------------------------|----------------------------------------------------|
 * | `amount > 1000`               | `{">": [{"var": "amount"}, 1000]}`                  |
 * | `status == "urgent"`          | `{"==": [{"var": "status"}, "urgent"]}`             |
 * | `a > 1 and b < 2`             | `{"and": [{">": [{"var":"a"}, 1]}, {"<": [{"var":"b"}, 2]}]}` |
 * | `contains(field, "val")`      | `{"in": ["val", {"var": "field"}]}`                 |
 * | `notContains(field, "val")`   | `{"!": {"in": ["val", {"var": "field"}]}}`          |
 */

import { Parser } from 'expr-eval';
import jsonLogic from 'json-logic-js';

const parser = new Parser();

// ---------------------------------------------------------------------------
// 表达式文本 → JsonLogic
// ---------------------------------------------------------------------------

/**
 * 表达式文本 → JsonLogic JSON。
 *
 * 解析策略：
 * 1. 先处理括号嵌套（提取最内层括号表达式，递归解析）
 * 2. 按顶层 ` and ` / ` or ` 分割
 * 3. 解析单个比较表达式（含 contains/notContains 函数）
 *
 * 解析失败返回 null。
 */
export function expressionToJsonLogic(expr: string): object | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  return parseExprToJsonLogic(trimmed);
}

/**
 * 直接解析表达式文本为 JsonLogic（不依赖 expr-eval AST）。
 *
 * 支持的格式：
 * - 单个比较：`amount > 1000`
 * - 扁平 AND：`amount > 1000 and status == "urgent"`
 * - 扁平 OR：`x == 1 or y == 2`
 * - contains/notContains 函数：`contains(field, "value")`
 * - 括号嵌套：`(a > 1 or b < 2) and c == 3`
 */
function parseExprToJsonLogic(expr: string): object | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  // 先处理括号嵌套 — 提取最内层括号表达式
  const parenMatch = trimmed.match(/\(([^()]+)\)/);
  if (parenMatch) {
    const inner = parseExprToJsonLogic(parenMatch[1]!);
    if (!inner) return null;
    const replaced = trimmed.replace(parenMatch[0], '__EXPR_PLACEHOLDER__');
    // 如果替换后还有运算符，继续递归处理
    if (replaced.includes(' and ') || replaced.includes(' or ')) {
      return combineWithPlaceholder(replaced, inner);
    }
    return inner;
  }

  // 按 ` and ` / ` or ` 分割
  const andParts = splitTopLevel(trimmed, ' and ');
  const orParts = splitTopLevel(trimmed, ' or ');

  if (andParts.length > 1 && orParts.length === 1) {
    const parts = andParts.map(p => parseExprToJsonLogic(p));
    if (parts.some(p => !p)) return null;
    return { and: parts };
  }
  if (orParts.length > 1 && andParts.length === 1) {
    const parts = orParts.map(p => parseExprToJsonLogic(p));
    if (parts.some(p => !p)) return null;
    return { or: parts };
  }

  // 单个条件
  return parseSingleComparison(trimmed);
}

/** 按顶层运算符分割（不分割括号内的） */
function splitTopLevel(str: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  const lower = str.toLowerCase();

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++;
    if (str[i] === ')') depth--;
    if (depth === 0 && lower.substring(i, i + separator.length) === separator) {
      parts.push(current.trim());
      current = '';
      i += separator.length - 1;
      continue;
    }
    current += str[i];
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** 组合占位符表达式与已解析的子表达式 */
function combineWithPlaceholder(expr: string, placeholder: object): object | null {
  const andParts = splitTopLevel(expr, ' and ');
  const orParts = splitTopLevel(expr, ' or ');

  if (andParts.length > 1) {
    const parts = andParts.map(p => {
      if (p.trim() === '__EXPR_PLACEHOLDER__') return placeholder;
      return parseExprToJsonLogic(p);
    });
    if (parts.some(p => !p)) return null;
    return { and: parts };
  }
  if (orParts.length > 1) {
    const parts = orParts.map(p => {
      if (p.trim() === '__EXPR_PLACEHOLDER__') return placeholder;
      return parseExprToJsonLogic(p);
    });
    if (parts.some(p => !p)) return null;
    return { or: parts };
  }
  return placeholder;
}

/** 解析单个比较表达式 */
function parseSingleComparison(str: string): object | null {
  const trimmed = str.trim();

  // contains(field, "value") → {"in": ["value", {"var": "field"}]}
  const containsMatch = trimmed.match(/^contains\((\w+),\s*(.+)\)$/i);
  if (containsMatch && containsMatch[1] && containsMatch[2]) {
    const field = containsMatch[1];
    const val = parseLiteral(containsMatch[2].trim());
    if (val !== undefined) return { in: [val, { var: field }] };
  }

  // notContains(field, "value") → {"!": {"in": ["val", {"var": "field"}]}}
  const notContainsMatch = trimmed.match(/^notContains\((\w+),\s*(.+)\)$/i);
  if (notContainsMatch && notContainsMatch[1] && notContainsMatch[2]) {
    const field = notContainsMatch[1];
    const val = parseLiteral(notContainsMatch[2].trim());
    if (val !== undefined) return { '!': { in: [val, { var: field }] } };
  }

  // 比较运算符
  const match = trimmed.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  const field = match[1];
  const op = match[2];
  const val = parseLiteral(match[3].trim());
  if (val === undefined) return null;

  const opMap: Record<string, string> = {
    '>': '>', '<': '<', '>=': '>=', '<=': '<=', '==': '==', '!=': '!=',
  };
  const jsonOp = opMap[op] ?? op;
  return { [jsonOp]: [{ var: field }, val] };
}

/** 解析字面量值（数字/双引号字符串/单引号字符串/布尔） */
function parseLiteral(str: string): unknown {
  if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
  if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  if (str === 'true') return true;
  if (str === 'false') return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// JsonLogic → 表达式文本
// ---------------------------------------------------------------------------

/**
 * JsonLogic JSON → 表达式文本（可读的 expr-eval 兼容语法）。
 */
export function jsonLogicToExpression(rule: unknown): string {
  if (!rule || typeof rule !== 'object') return '';
  return formatRule(rule as Record<string, unknown>);
}

/** 递归格式化 JsonLogic 规则为表达式文本 */
function formatRule(rule: Record<string, unknown>): string {
  const keys = Object.keys(rule);
  if (keys.length !== 1) return '';

  const op = keys[0]!;
  const args = rule[op] as unknown[];

  switch (op) {
    case 'and':
      return (args as unknown[]).map(a => formatRule(a as Record<string, unknown>)).join(' and ');
    case 'or':
      return (args as unknown[]).map(a => formatRule(a as Record<string, unknown>)).join(' or ');
    case '!': {
      const inner = formatRule(args[0] as Record<string, unknown>);
      return `not(${inner})`;
    }
    case 'in': {
      // ["val", {"var": "field"}] → contains(field, "val")
      const val = formatValue(args[0]);
      const fieldVar = args[1] as Record<string, unknown>;
      const fieldName = (fieldVar?.['var'] as string) ?? 'unknown';
      return `contains(${fieldName}, ${val})`;
    }
    case '>':
    case '<':
    case '>=':
    case '<=':
    case '==':
    case '!=': {
      const fieldVar = args[0] as Record<string, unknown>;
      const fieldName = (fieldVar?.['var'] as string) ?? 'unknown';
      const val = formatValue(args[1]);
      return `${fieldName} ${op} ${val}`;
    }
    default:
      return '';
  }
}

/** 格式化值为表达式文本 */
function formatValue(val: unknown): string {
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  return 'null';
}

// ---------------------------------------------------------------------------
// JsonLogic 求值（前端预览/校验）
// ---------------------------------------------------------------------------

/**
 * 用 JsonLogic 求值规则。
 * @param rule JsonLogic 规则
 * @param data 数据作用域（扁平化变量）
 * @returns 求值结果
 */
export function evaluateJsonLogic(
  rule: object,
  data: Record<string, unknown>,
): boolean {
  try {
    return Boolean(jsonLogic.apply(rule, data));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JsonLogic 校验
// ---------------------------------------------------------------------------

/**
 * 校验 JsonLogic 规则是否有效。
 */
export function validateJsonLogic(rule: unknown): { valid: boolean; error?: string } {
  if (!rule) return { valid: true };
  if (typeof rule !== 'object') return { valid: false, error: '规则必须是对象' };
  try {
    // 尝试求值（用空数据，不抛异常即合法）
    jsonLogic.apply(rule as Record<string, unknown>, {});
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// 表达式校验（复用 expr-eval）
// ---------------------------------------------------------------------------

/**
 * 校验表达式语法是否合法（expr-eval 可解析）。
 * 用于表达式模式实时校验。
 */
export function validateExpression(expr: string): { valid: boolean; error?: string } {
  const trimmed = expr.trim();
  if (!trimmed) return { valid: true };
  try {
    parser.parse(trimmed);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}
