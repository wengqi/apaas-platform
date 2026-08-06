/**
 * 公式引擎 — 计算 Formula 类型字段的值。
 *
 * 基于 expr-eval 表达式解析器，提供轻量的公式计算能力。
 *
 * 表达式语法：
 *   - 用 `{{...}}` 包裹变量引用与表达式，如 `{{price * quantity}}`、`{{amount + tax}}`
 *   - 算术：+ - * /
 *   - 字符串拼接：+ （自动转换为 expr-eval 的 || 操作符）
 *   - 比较：> < == != >= <=
 *   - 逻辑：&& || !（自动转换为 expr-eval 的 and / or / not）
 *   - 也支持 `{{var}} op {{var}}` 的分段写法，如 `{{price}} * {{quantity}}`
 *
 * 支持的函数：ROUND、ABS、LEN、UPPER、LOWER、CONCAT、IF、NOW、TODAY
 *
 * 实现说明：
 * expr-eval 与平台语法的差异通过预处理桥接：
 *   1. `+` 在操作数含字符串字面量时改写为 `||`（expr-eval 的拼接操作符）
 *   2. `&&`/`||`/`!` 改写为 `and`/`or`/`not`（expr-eval 的逻辑操作符）
 *   3. 原始类型变量替换为字面量，避免 expr-eval 把字符串值参与数值运算产生 NaN
 *   4. 字符串字面量本身不被替换，保证 `+` 改写能正确识别拼接场景
 */

import { Parser } from 'expr-eval';
import { FieldType, type Field, type FormulaConfig } from '@apaas/shared';

/** 单例 Parser，注册平台支持的函数。 */
const parser = new Parser();

// 注册平台公式函数（大写命名，对公式作者更友好）
parser.functions.ROUND = (num: number, digits = 0): number => {
  const factor = Math.pow(10, digits);
  return Math.round(num * factor) / factor;
};
parser.functions.ABS = (num: number): number => Math.abs(num);
parser.functions.LEN = (s: unknown): number => String(s ?? '').length;
parser.functions.UPPER = (s: unknown): string => String(s ?? '').toUpperCase();
parser.functions.LOWER = (s: unknown): string => String(s ?? '').toLowerCase();
parser.functions.CONCAT = (...args: unknown[]): string => args.map((a) => String(a ?? '')).join('');
// IF：等价于三元表达式，但更贴近公式作者的书写习惯
parser.functions.IF = (cond: unknown, truthy: unknown, falsy: unknown): unknown =>
  cond ? truthy : falsy;
parser.functions.NOW = (): string => new Date().toISOString();
parser.functions.TODAY = (): string => new Date().toISOString().slice(0, 10);

/** 判断值是否为原始类型（变量替换时仅处理原始类型）。 */
function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** 转义字符串用于构建正则。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 预处理平台公式语法，转换为 expr-eval 可解析的表达式。
 *
 * 步骤：
 *   1. 去除 `{{ }}` 包裹
 *   2. 按字符串字面量分段：仅对非字符串段做变量替换与操作符改写
 *   3. 原始类型变量替换为 JSON 字面量（跳过函数调用位置）
 *   4. 逻辑操作符改写：`&&`→`and`、`||`→`or`、`!`→`not`（保留 `!=`）
 *   5. 字符串拼接改写：与字符串字面量相邻的 `+` 改为 `||`
 */
function preprocess(formula: string, data: Record<string, unknown>): string {
  // 1. 去除 {{ }} 包裹
  let expr = formula.replace(/\{\{/g, '').replace(/\}\}/g, '').trim();
  if (!expr) return '';

  // 2. 按字符串字面量分段处理
  const parts = expr.split(/("(?:[^"\\]|\\.)*")/);
  for (let i = 0; i < parts.length; i += 2) {
    let segment = parts[i]!;

    // 3. 原始类型变量替换为字面量（按长度倒序，避免短名覆盖长名前缀）
    const varNames = Object.keys(data)
      .filter((k) => isPrimitive(data[k]) && data[k] !== null)
      .sort((a, b) => b.length - a.length);
    if (varNames.length > 0) {
      const pattern = new RegExp(`\\b(${varNames.map(escapeRegExp).join('|')})(?!\\s*\\()`, 'g');
      segment = segment.replace(pattern, (_, name: string) => JSON.stringify(data[name]));
    }

    // 4. 逻辑操作符改写
    segment = segment.replace(/&&/g, ' and ');
    segment = segment.replace(/\|\|/g, ' or ');
    // `!` 改为 `not`，但保留 `!=`
    segment = segment.replace(/!(?!=)/g, 'not ');

    parts[i] = segment;
  }
  expr = parts.join('');

  // 5. 字符串拼接改写：与字符串字面量相邻的 + 改为 ||
  //    循环至稳定，处理 `"a" + "b" + "c"` 这类链式拼接
  let previous: string;
  do {
    previous = expr;
    expr = expr.replace(/("(?:[^"\\]|\\.)*")\s*\+/g, '$1 ||');
    expr = expr.replace(/\+\s*("(?:[^"\\]|\\.)*")/g, '|| $1');
  } while (expr !== previous);

  return expr;
}

/**
 * 公式引擎 — 计算 Formula 类型字段。
 *
 * 无状态、线程安全；Parser 单例在模块加载时初始化。
 */
export class FormulaEngine {
  /**
   * 计算单个公式表达式。
   *
   * @param formula 公式表达式（可含 `{{ }}` 包裹）
   * @param data    记录字段值（key = field.apiName）
   * @returns 计算结果；公式为空或解析失败时返回 null
   */
  compute(formula: string, data: Record<string, unknown>): unknown {
    const expr = preprocess(formula, data);
    if (!expr) return null;
    try {
      const result = parser.parse(expr).evaluate(data as never);
      return result === undefined ? null : result;
    } catch {
      // 解析或求值失败（语法错误、未知变量、类型不符等）返回 null，
      // 不抛出以避免单条记录的计算阻断整体写入
      return null;
    }
  }

  /**
   * 计算记录中所有 Formula 类型字段，返回需要写入 data 的计算结果。
   *
   * 仅处理 type === Formula 的字段；非公式字段不参与。
   * 公式字段可能引用其他公式字段的结果，因此按字段数组顺序计算，
   * 并将中间结果合并进 data 供后续公式引用（支持链式公式）。
   *
   * @param fields 对象的字段定义数组
   * @param data   记录当前字段值（会被复制，不修改入参）
   * @returns 公式字段 apiName -> 计算结果 的映射
   */
  computeRecordFields(fields: Field[], data: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...data };
    const results: Record<string, unknown> = {};

    for (const field of fields) {
      if (field.type !== FieldType.Formula) continue;
      const config = field.config as { formula?: FormulaConfig } | undefined;
      const expression = config?.formula?.expression;
      if (!expression) continue;

      const value = this.compute(expression, merged);
      results[field.apiName] = value;
      // 合并进 merged，使后续公式可引用本公式字段的值（链式计算）
      merged[field.apiName] = value;
    }

    return results;
  }
}
