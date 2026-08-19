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
 * - 为空：`isEmpty(field)` / 不为空：`isNotEmpty(field)`
 * - 属于：`in(field, [val1, val2])` / 不属于：`notIn(field, [val1, val2])`
 *
 * 转换规则：
 * | 表达式                        | JsonLogic                                          |
 * |-------------------------------|----------------------------------------------------|
 * | `amount > 1000`               | `{">": [{"var": "amount"}, 1000]}`                  |
 * | `status == "urgent"`          | `{"==": [{"var": "status"}, "urgent"]}`             |
 * | `a > 1 and b < 2`             | `{"and": [{">": [{"var":"a"}, 1]}, {"<": [{"var":"b"}, 2]}]}` |
 * | `contains(field, "val")`      | `{"in": ["val", {"var": "field"}]}`                 |
 * | `notContains(field, "val")`   | `{"!": {"in": ["val", {"var": "field"}]}}`          |
 * | `isEmpty(field)`              | `{"!": {"var": "field"}}`                           |
 * | `isNotEmpty(field)`           | `{"!!": {"var": "field"}}`                          |
 * | `in(field, ["a","b"])`        | `{"in": [{"var": "field"}, ["a","b"]]}`             |
 * | `notIn(field, ["a","b"])`     | `{"!": {"in": [{"var": "field"}, ["a","b"]]}}`      |
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

  // 优先匹配整个表达式是单个函数（isEmpty/isNotEmpty/contains/notContains/in/notIn）。
  // 注意：parseSingleComparison 还包含单比较的逻辑，但函数表达式需要先于复合表达式处理，
  // 否则函数圆括号会被外层括号嵌套匹配误解析。
  const asFunc = tryParseFunctionExpression(trimmed);
  if (asFunc) return asFunc;

  // 先处理括号嵌套 — 提取最内层括号表达式。
  // 注意：函数表达式（isEmpty/contains/in 等）的括号不应被捕获。
  // 用 lookbehind 方式检查括号前是否有函数名前缀（如 contains(、in( 等）。
  const parenMatch = getNonFnParenMatch(trimmed);
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
    const parts = andParts.map((p) => parseExprToJsonLogic(p));
    if (parts.some((p) => !p)) return null;
    return { and: parts };
  }
  if (orParts.length > 1 && andParts.length === 1) {
    const parts = orParts.map((p) => parseExprToJsonLogic(p));
    if (parts.some((p) => !p)) return null;
    return { or: parts };
  }

  // 单个条件
  return parseSingleComparison(trimmed);
}

/**
 * 仅尝试解析整个表达式是单个函数调用（isEmpty/isNotEmpty/contains/notContains/in/notIn）。
 * 返回 null 表示不是函数表达式，需要走其它分支处理。
 */
function tryParseFunctionExpression(trimmed: string): object | null {
  // 函数名 + (参数)
  const m = trimmed.match(/^(isEmpty|isNotEmpty|contains|notContains|in|notIn)\(([\s\S]+)\)$/i);
  if (!m) return null;
  const fn = m[1]!.toLowerCase();
  const args = m[2]!;

  if (fn === 'isempty' || fn === 'isnotempty') {
    // 单参数：字段名
    const fieldMatch = args.match(/^[\s]*([a-zA-Z_][\w]*)[\s]*$/);
    if (!fieldMatch) return null;
    const field = fieldMatch[1]!;
    return fn === 'isempty' ? { '!': { var: field } } : { '!!': { var: field } };
  }

  if (fn === 'contains' || fn === 'notcontains') {
    // 参数：field, value
    const splitIdx = findTopLevelComma(args);
    if (splitIdx < 0) return null;
    const field = args.slice(0, splitIdx).trim();
    const valueStr = args.slice(splitIdx + 1).trim();
    if (!/^[a-zA-Z_][\w]*$/.test(field)) return null;
    const value = parseLiteral(valueStr);
    if (value === undefined) return null;
    return fn === 'contains'
      ? { in: [value, { var: field }] }
      : { '!': { in: [value, { var: field }] } };
  }

  if (fn === 'in' || fn === 'notin') {
    // 参数：field, [v1, v2, ...]
    const splitIdx = findTopLevelComma(args);
    if (splitIdx < 0) return null;
    const field = args.slice(0, splitIdx).trim();
    const arrStr = args.slice(splitIdx + 1).trim();
    if (!/^[a-zA-Z_][\w]*$/.test(field)) return null;
    if (!arrStr.startsWith('[') || !arrStr.endsWith(']')) return null;
    const arrBody = arrStr.slice(1, -1).trim();
    const values: unknown[] = [];
    if (arrBody.length === 0) {
      // 空数组
    } else {
      let cursor = 0;
      while (cursor < arrBody.length) {
        const c = findTopLevelComma(arrBody, cursor);
        const end = c < 0 ? arrBody.length : c;
        const itemStr = arrBody.slice(cursor, end).trim();
        const v = parseLiteral(itemStr);
        if (v === undefined) return null;
        values.push(v);
        if (c < 0) break;
        cursor = c + 1;
      }
    }
    return fn === 'in'
      ? { in: [{ var: field }, values] }
      : { '!': { in: [{ var: field }, values] } };
  }

  return null;
}

/** 查找顶层第一个逗号（忽略括号/方括号/字符串内的逗号）。返回索引，未找到返回 -1。 */
function findTopLevelComma(str: string, startFrom = 0): number {
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = startFrom; i < str.length; i++) {
    const ch = str[i]!;
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
}

/** 函数名集合（忽略大小写） */
const FUNC_NAMES = new Set(['isempty', 'isnotempty', 'contains', 'notcontains', 'in', 'notin']);

/**
 * 返回非函数括号的最内层匹配。
 * 跳过函数调用形式的括号（如 contains(、in( 等），只匹配纯嵌套括号（如 (a > 1)）。
 */
function getNonFnParenMatch(str: string): RegExpMatchArray | null {
  const m = str.match(/\(([^()]+)\)/);
  if (!m) return null;

  // 检查括号前的 token 是否是函数名
  const prefixEnd = m.index ?? 0;
  const before = str.slice(0, prefixEnd).trimEnd();
  const tokenMatch = before.match(/([a-zA-Z_][\w]*)\s*$/);
  if (tokenMatch && FUNC_NAMES.has(tokenMatch[1]!.toLowerCase())) {
    // 这是函数调用的括号 → 跳过，返回 null 让 split 逻辑处理
    return null;
  }

  return m;
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
    const parts = andParts.map((p) => {
      if (p.trim() === '__EXPR_PLACEHOLDER__') return placeholder;
      return parseExprToJsonLogic(p);
    });
    if (parts.some((p) => !p)) return null;
    return { and: parts };
  }
  if (orParts.length > 1) {
    const parts = orParts.map((p) => {
      if (p.trim() === '__EXPR_PLACEHOLDER__') return placeholder;
      return parseExprToJsonLogic(p);
    });
    if (parts.some((p) => !p)) return null;
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

  // isEmpty(field) → {"!": {"var": "field"}}
  const isEmptyMatch = trimmed.match(/^isEmpty\((\w+)\)$/i);
  if (isEmptyMatch && isEmptyMatch[1]) {
    return { '!': { var: isEmptyMatch[1] } };
  }

  // isNotEmpty(field) → {"!!": {"var": "field"}}
  const isNotEmptyMatch = trimmed.match(/^isNotEmpty\((\w+)\)$/i);
  if (isNotEmptyMatch && isNotEmptyMatch[1]) {
    return { '!!': { var: isNotEmptyMatch[1] } };
  }

  // in(field, [val1, val2]) → {"in": [{"var": "field"}, [val1, val2]]}
  const inMatch = trimmed.match(/^in\((\w+),\s*\[(.+)\]\)$/i);
  if (inMatch && inMatch[1] && inMatch[2]) {
    const field = inMatch[1];
    const values = parseArrayLiteral(inMatch[2]);
    if (values) return { in: [{ var: field }, values] };
  }

  // notIn(field, [val1, val2]) → {"!": {"in": [{"var": "field"}, [val1, val2]]}}
  const notInMatch = trimmed.match(/^notIn\((\w+),\s*\[(.+)\]\)$/i);
  if (notInMatch && notInMatch[1] && notInMatch[2]) {
    const field = notInMatch[1];
    const values = parseArrayLiteral(notInMatch[2]);
    if (values) return { '!': { in: [{ var: field }, values] } };
  }

  // 比较运算符
  const match = trimmed.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  const field = match[1];
  const op = match[2];
  const val = parseLiteral(match[3].trim());
  if (val === undefined) return null;

  const opMap: Record<string, string> = {
    '>': '>',
    '<': '<',
    '>=': '>=',
    '<=': '<=',
    '==': '==',
    '!=': '!=',
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

/** 解析数组字面量："val1", "val2", 123 → ["val1", "val2", 123] */
function parseArrayLiteral(str: string): unknown[] | null {
  const parts: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if (inQuote) {
      current += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  const values = parts.map((p) => parseLiteral(p));
  if (values.some((v) => v === undefined)) return null;
  return values;
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
  const rawArgs = rule[op];

  // JsonLogic 的值可能是数组（and/or/比较）或单个对象（!）
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  switch (op) {
    case 'and':
      return (args as unknown[]).map((a) => formatRule(a as Record<string, unknown>)).join(' and ');
    case 'or':
      return (args as unknown[]).map((a) => formatRule(a as Record<string, unknown>)).join(' or ');
    case '!': {
      // "!" 可能是：isEmpty（内层是 var）、notContains（内层是 in）、notIn（内层是 in 且格式不同）、not（通用）
      const innerRule = args[0] as Record<string, unknown>;
      const innerOp =
        innerRule && typeof innerRule === 'object' ? Object.keys(innerRule)[0] : undefined;

      // {"!": {"var": "field"}} → isEmpty(field)
      if (innerOp === 'var') {
        const fieldName = (innerRule!['var'] as string) ?? 'unknown';
        return `isEmpty(${fieldName})`;
      }

      if (innerOp === 'in') {
        const inArgs = innerRule!['in'] as unknown[];
        // 判断是 contains 还是 notIn：contains 格式是 ["val", {"var":"field"}]
        // notIn 格式是 [{"var":"field"}, ["val1","val2"]]
        const first = inArgs[0];
        if (first && typeof first === 'object' && 'var' in (first as Record<string, unknown>)) {
          // 格式：{"!": {"in": [{"var":"field"}, ["val1","val2"]]}} → notIn(field, ["val1","val2"])
          const fieldVar = first as Record<string, unknown>;
          const fieldName = (fieldVar['var'] as string) ?? 'unknown';
          const vals = inArgs[1];
          return `notIn(${fieldName}, [${formatArrayValue(vals)}])`;
        }
        // 格式：{"!": {"in": ["val", {"var":"field"}]}} → notContains(field, "val")
        const val = formatValue(inArgs[0]);
        const fieldVar = inArgs[1] as Record<string, unknown>;
        const fieldName = (fieldVar?.['var'] as string) ?? 'unknown';
        return `notContains(${fieldName}, ${val})`;
      }

      // 通用 not(...)
      const inner = formatRule(innerRule);
      return `not(${inner})`;
    }
    case '!!': {
      // {"!!": {"var": "field"}} → isNotEmpty(field)
      const innerRule = args[0] as Record<string, unknown>;
      if (innerRule && typeof innerRule === 'object' && 'var' in innerRule) {
        const fieldName = (innerRule['var'] as string) ?? 'unknown';
        return `isNotEmpty(${fieldName})`;
      }
      return `not(not(${formatRule(innerRule)}))`;
    }
    case 'in': {
      // 两种格式：
      // 1. ["val", {"var": "field"}] → contains(field, "val")
      // 2. [{"var": "field"}, ["val1","val2"]] → in(field, ["val1","val2"])
      const first = args[0];
      const second = args[1];

      if (first && typeof first === 'object' && 'var' in (first as Record<string, unknown>)) {
        // 格式 2：in(field, [val1, val2])
        const fieldVar = first as Record<string, unknown>;
        const fieldName = (fieldVar['var'] as string) ?? 'unknown';
        return `in(${fieldName}, [${formatArrayValue(second)}])`;
      }

      // 格式 1：contains(field, "val")
      const val = formatValue(first);
      const fieldVar = second as Record<string, unknown>;
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

/** 格式化数组值为表达式文本：["a","b"] → `"a", "b"` */
function formatArrayValue(val: unknown): string {
  if (Array.isArray(val)) {
    return val.map((v) => formatValue(v)).join(', ');
  }
  return formatValue(val);
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
export function evaluateJsonLogic(rule: object, data: Record<string, unknown>): boolean {
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
