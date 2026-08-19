/**
 * jsonlogic-utils 工具函数 —— 表达式文本 ↔ JsonLogic JSON 转换 + 求值/校验。
 *
 * JsonLogic 是一种跨语言的逻辑序列化标准（jsonlogic.com）：
 * - 安全：无 eval、无副作用、确定性计算
 * - 可序列化：原生 JSON，可存储到数据库
 * - 跨语言：JS / Python / Java / PHP / Ruby / Go
 *
 * 表达式语法：
 * - 逻辑运算符（小写）：`and` / `or` / `not`
 * - 字符串双/单引号：`status == "urgent"` / `name == 'alice'`
 * - 比较运算符：`>` `<` `>=` `<=` `==` `!=`
 * - 为空：`isEmpty(field)` / 不为空：`isNotEmpty(field)`
 * - 包含：`contains(field, "value")` / `notContains(field, "value")`
 * - 属于：`in(field, [val1, val2])` / 不属于：`notIn(field, [val1, val2])`
 * - 括号嵌套：`(a > 1 or b < 2) and c == 3`、多层 `((a > 1))`
 * - not 优先级：`not (a > 1 and b < 2)`
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
 * | `not (a > 1)`                 | `{"!": [{">": [{"var":"a"}, 1]}]}`                  |
 */

import jsonLogic from 'json-logic-js';

// ---------------------------------------------------------------------------
// 表达式文本 → JsonLogic（递归下降解析器）
// ---------------------------------------------------------------------------

/** Token 类型 */
type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '>' | '<' | '>=' | '<=' | '==' | '!=' }
  | { type: 'kw'; value: 'and' | 'or' | 'not' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'lbracket' }
  | { type: 'rbracket' }
  | { type: 'comma' };

/** 词法分析：表达式 → Token 序列 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input;

  while (i < src.length) {
    const ch = src[i]!;

    // 跳过空白
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 单字符 token
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'lbracket' });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'rbracket' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }

    // 双/单引号字符串
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let s = '';
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) {
          s += src[i + 1];
          i += 2;
        } else {
          s += src[i]!;
          i++;
        }
      }
      if (i >= src.length) throw new Error('字符串未闭合');
      i++; // 跳过结束引号
      tokens.push({ type: 'string', value: s });
      continue;
    }

    // 数字（含负数）
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let s = '';
      if (ch === '-') {
        s += '-';
        i++;
      }
      while (i < src.length && /[0-9.]/.test(src[i]!)) {
        s += src[i];
        i++;
      }
      const n = parseFloat(s);
      if (Number.isNaN(n)) throw new Error(`无效数字: ${s}`);
      tokens.push({ type: 'number', value: n });
      continue;
    }

    // 比较运算符（>/</>=/<=/==/!=）
    if (ch === '>' || ch === '<' || ch === '=' || ch === '!') {
      let s = ch;
      const next = src[i + 1];
      if ((ch === '>' || ch === '<' || ch === '!') && next === '=') {
        s += '=';
        i += 2;
      } else if (ch === '=' && next === '=') {
        s += '=';
        i += 2;
      } else {
        i++;
      }
      if (s === '>' || s === '<' || s === '>=' || s === '<=' || s === '==' || s === '!=') {
        tokens.push({ type: 'op', value: s as '>' | '<' | '>=' | '<=' | '==' | '!=' });
        continue;
      }
      throw new Error(`无效比较运算符: ${s}`);
    }

    // 标识符 / 关键字（字母开头可含字母数字下划线）
    if (/[a-zA-Z_]/.test(ch)) {
      let s = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i]!)) {
        s += src[i];
        i++;
      }
      const lower = s.toLowerCase();
      if (lower === 'and') tokens.push({ type: 'kw', value: 'and' });
      else if (lower === 'or') tokens.push({ type: 'kw', value: 'or' });
      else if (lower === 'not') tokens.push({ type: 'kw', value: 'not' });
      else if (lower === 'true') tokens.push({ type: 'bool', value: true });
      else if (lower === 'false') tokens.push({ type: 'bool', value: false });
      else tokens.push({ type: 'ident', value: s });
      continue;
    }

    throw new Error(`无法识别的字符: ${ch}`);
  }

  return tokens;
}

/** 递归下降解析器 */
class ExprParser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  /** 入口：parseExpression */
  parseExpression(): object | null {
    const result = this.parseOr();
    if (!result) return null;
    // 必须消费完所有 token，否则有多余内容
    if (this.pos < this.tokens.length) return null;
    return result;
  }

  /** orExpr → andExpr ( 'or' andExpr )* */
  private parseOr(): object | null {
    let left = this.parseAnd();
    if (!left) return null;
    while (this.peekKw('or')) {
      this.advance();
      const right = this.parseAnd();
      if (!right) return null;
      left = { or: [left, right] };
    }
    return left;
  }

  /** andExpr → notExpr ( 'and' notExpr )* */
  private parseAnd(): object | null {
    let left = this.parseNot();
    if (!left) return null;
    while (this.peekKw('and')) {
      this.advance();
      const right = this.parseNot();
      if (!right) return null;
      left = { and: [left, right] };
    }
    return left;
  }

  /** notExpr → 'not' notExpr | primary */
  private parseNot(): object | null {
    if (this.peekKw('not')) {
      this.advance();
      const inner = this.parseNot();
      if (!inner) return null;
      return { '!': inner };
    }
    return this.parsePrimary();
  }

  /** primary → functionCall | comparison | '(' expression ')' */
  private parsePrimary(): object | null {
    const tok = this.peek();
    if (!tok) return null;

    // 函数调用：ident '(' ...
    if (tok.type === 'ident' && this.peekAt(1)?.type === 'lparen') {
      return this.parseFunctionCall();
    }

    // 比较表达式：ident op value
    if (tok.type === 'ident') {
      return this.parseComparison();
    }

    // 括号表达式
    if (tok.type === 'lparen') {
      this.advance();
      const inner = this.parseOr();
      if (!inner) return null;
      const close = this.peek();
      if (close?.type !== 'rparen') return null;
      this.advance();
      return inner;
    }

    return null;
  }

  /** 函数调用：isEmpty / isNotEmpty / contains / notContains / in / notIn */
  private parseFunctionCall(): object | null {
    const nameTok = this.peek();
    if (nameTok?.type !== 'ident') return null;
    const name = nameTok.value;
    this.advance(); // ident
    if (this.peek()?.type !== 'lparen') return null;
    this.advance(); // (

    const lower = name.toLowerCase();
    let result: object | null = null;

    if (lower === 'isempty' || lower === 'isnotempty') {
      const fieldTok = this.peek();
      if (fieldTok?.type !== 'ident') return null;
      const field = fieldTok.value;
      this.advance();
      if (this.peek()?.type !== 'rparen') return null;
      this.advance();
      result = lower === 'isempty' ? { '!': { var: field } } : { '!!': { var: field } };
    } else if (lower === 'contains' || lower === 'notcontains') {
      const fieldTok = this.peek();
      if (fieldTok?.type !== 'ident') return null;
      const field = fieldTok.value;
      this.advance();
      if (this.peek()?.type !== 'comma') return null;
      this.advance();
      const val = this.parseValue();
      if (val === undefined) return null;
      if (this.peek()?.type !== 'rparen') return null;
      this.advance();
      result =
        lower === 'contains'
          ? { in: [val, { var: field }] }
          : { '!': { in: [val, { var: field }] } };
    } else if (lower === 'in' || lower === 'notin') {
      const fieldTok = this.peek();
      if (fieldTok?.type !== 'ident') return null;
      const field = fieldTok.value;
      this.advance();
      if (this.peek()?.type !== 'comma') return null;
      this.advance();
      const arr = this.parseArrayLiteral();
      if (!arr) return null;
      if (this.peek()?.type !== 'rparen') return null;
      this.advance();
      result =
        lower === 'in' ? { in: [{ var: field }, arr] } : { '!': { in: [{ var: field }, arr] } };
    } else {
      // 未知函数名
      return null;
    }

    return result;
  }

  /** 比较表达式：field op value */
  private parseComparison(): object | null {
    const fieldTok = this.peek();
    if (fieldTok?.type !== 'ident') return null;
    const field = fieldTok.value;
    this.advance();

    const opTok = this.peek();
    if (opTok?.type !== 'op') return null;
    const op = opTok.value;
    this.advance();

    const val = this.parseValue();
    if (val === undefined) return null;

    return { [op]: [{ var: field }, val] };
  }

  /** 解析字面量值：number / string / bool / array */
  private parseValue(): unknown {
    const tok = this.peek();
    if (!tok) return undefined;
    if (tok.type === 'number') {
      this.advance();
      return tok.value;
    }
    if (tok.type === 'string') {
      this.advance();
      return tok.value;
    }
    if (tok.type === 'bool') {
      this.advance();
      return tok.value;
    }
    return undefined;
  }

  /** 解析数组字面量：[v1, v2, ...] */
  private parseArrayLiteral(): unknown[] | null {
    if (this.peek()?.type !== 'lbracket') return null;
    this.advance(); // [
    const items: unknown[] = [];
    if (this.peek()?.type === 'rbracket') {
      this.advance();
      return items;
    }
    while (true) {
      const v = this.parseValue();
      if (v === undefined) return null;
      items.push(v);
      const next = this.peek();
      if (next?.type === 'comma') {
        this.advance();
        continue;
      }
      if (next?.type === 'rbracket') {
        this.advance();
        return items;
      }
      return null;
    }
  }

  private peekKw(kw: 'and' | 'or' | 'not'): boolean {
    const t = this.peek();
    return t?.type === 'kw' && t.value === kw;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private peekAt(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): void {
    this.pos++;
  }
}

/**
 * 表达式文本 → JsonLogic JSON。
 *
 * 使用递归下降解析器，支持：
 * - 任意深度括号嵌套
 * - 函数表达式（isEmpty/contains/in 等不再被括号处理误解析）
 * - not 运算符
 * - AND/OR 任意混合（按运算符优先级）
 *
 * 解析失败返回 null。
 */
export function expressionToJsonLogic(expr: string): object | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return null;
    const parser = new ExprParser(tokens);
    return parser.parseExpression();
  } catch {
    return null;
  }
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
  const result = expressionToJsonLogic(trimmed);
  return result ? { valid: true } : { valid: false, error: '表达式语法不正确' };
}
