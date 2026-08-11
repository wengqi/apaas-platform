/**
 * 自定义筛选条件逻辑解析器。
 *
 * 将飞书风格的条件序号引用表达式（如 "1 and (2 or 3)"）解析为组合 JsonLogic 规则。
 *
 * 语法：
 * - 数字引用条件序号：1, 2, 3 ...
 * - 逻辑运算符（小写）：and / or
 * - 括号嵌套：(1 or 2) and 3
 * - not 运算符：not 1
 *
 * 示例：
 *   conditions = [
 *     { ">": [{"var":"amount"}, 1000] },     // 条件 1
 *     { "==": [{"var":"status"}, "urgent"] } // 条件 2
 *   ]
 *   expression = "1 and 2"
 *   → { "and": [{">":...}, {"==":...}] }
 *
 *   expression = "1 or (2 and not 1)"
 *   → { "or": [{">":...}, {"and": [{"==":...}, {"!": {">":...}}]}] }
 */

/** 条件序号引用表达式解析结果 */
export interface CustomLogicParseResult {
  /** 解析成功后的 JsonLogic 规则 */
  logic: object | null;
  /** 解析错误信息（null = 成功） */
  error: string | null;
}

/**
 * 解析自定义筛选条件逻辑表达式。
 *
 * @param expression 条件序号引用表达式，如 "1 and (2 or 3)"
 * @param conditions 各条件的 JsonLogic 规则数组（序号从 1 开始）
 * @returns 解析结果 { logic, error }
 */
export function parseCustomLogic(expression: string, conditions: object[]): CustomLogicParseResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { logic: null, error: '表达式不能为空' };
  }

  if (conditions.length === 0) {
    return { logic: null, error: '没有可引用的条件' };
  }

  try {
    const tokens = tokenize(trimmed);
    const parser = new LogicParser(tokens, conditions);
    const result = parser.parseExpression();
    parser.expectEnd();
    return { logic: result, error: null };
  } catch (e) {
    return { logic: null, error: (e as Error).message };
  }
}

/**
 * 生成默认逻辑表达式（全部 AND）。
 * 条件数 N → "1 and 2 and ... and N"
 */
export function generateDefaultLogic(conditionCount: number): string {
  if (conditionCount <= 0) return '';
  if (conditionCount === 1) return '1';
  return Array.from({ length: conditionCount }, (_, i) => String(i + 1)).join(' and ');
}

/**
 * 校验表达式中的条件序号是否合法（不超出条件数）。
 */
export function validateCustomLogic(
  expression: string,
  conditionCount: number,
): { valid: boolean; error?: string } {
  const trimmed = expression.trim();
  if (!trimmed) return { valid: false, error: '表达式不能为空' };

  // 提取所有数字
  const numbers = trimmed.match(/\d+/g);
  if (!numbers) return { valid: false, error: '表达式中未引用任何条件序号' };

  for (const num of numbers) {
    const n = parseInt(num, 10);
    if (isNaN(n) || n < 1 || n > conditionCount) {
      return { valid: false, error: `条件序号 ${num} 超出范围（1-${conditionCount}）` };
    }
  }

  // 尝试完整解析
  const dummyConditions = Array.from({ length: conditionCount }, () => ({ truthy: [] }));
  const result = parseCustomLogic(trimmed, dummyConditions);
  if (result.error) return { valid: false, error: result.error };

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType = 'number' | 'and' | 'or' | 'not' | 'lparen' | 'rparen';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i]!;

    // 跳过空白
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 括号
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i++;
      continue;
    }

    // 数字
    if (/\d/.test(ch)) {
      let num = '';
      while (i < expr.length && /\d/.test(expr[i]!)) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // 字母关键字（and/or/not）
    if (/[a-zA-Z]/.test(ch)) {
      let word = '';
      while (i < expr.length && /[a-zA-Z]/.test(expr[i]!)) {
        word += expr[i];
        i++;
      }
      const lower = word.toLowerCase();
      if (lower === 'and' || lower === 'or' || lower === 'not') {
        tokens.push({ type: lower, value: word });
        continue;
      }
      throw new Error(`未知关键字: ${word}`);
    }

    throw new Error(`无法解析的字符: ${ch}`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser（递归下降）
// ---------------------------------------------------------------------------

class LogicParser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly conditions: object[],
  ) {}

  /** expression → orExpr */
  parseExpression(): object {
    return this.parseOr();
  }

  /** orExpr → andExpr ( 'or' andExpr )* */
  private parseOr(): object {
    let left = this.parseAnd();
    while (this.peek()?.type === 'or') {
      this.advance();
      const right = this.parseAnd();
      left = { or: [left, right] };
    }
    return left;
  }

  /** andExpr → notExpr ( 'and' notExpr )* */
  private parseAnd(): object {
    let left = this.parseNot();
    while (this.peek()?.type === 'and') {
      this.advance();
      const right = this.parseNot();
      left = { and: [left, right] };
    }
    return left;
  }

  /** notExpr → 'not' notExpr | primary */
  private parseNot(): object {
    if (this.peek()?.type === 'not') {
      this.advance();
      const inner = this.parseNot();
      return { '!': inner };
    }
    return this.parsePrimary();
  }

  /** primary → number | '(' expression ')' */
  private parsePrimary(): object {
    const token = this.peek();
    if (!token) throw new Error('表达式不完整，缺少条件引用');

    if (token.type === 'number') {
      this.advance();
      const num = parseInt(token.value, 10);
      if (num < 1 || num > this.conditions.length) {
        throw new Error(`条件序号 ${num} 超出范围（1-${this.conditions.length}）`);
      }
      // 序号从 1 开始，数组从 0 开始
      return this.conditions[num - 1]!;
    }

    if (token.type === 'lparen') {
      this.advance();
      const expr = this.parseExpression();
      const next = this.peek();
      if (next?.type !== 'rparen') {
        throw new Error('缺少右括号 )');
      }
      this.advance();
      return expr;
    }

    throw new Error(`意外的 token: ${token.value}`);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): void {
    this.pos++;
  }

  expectEnd(): void {
    if (this.pos < this.tokens.length) {
      const remaining = this.tokens
        .slice(this.pos)
        .map((t) => t.value)
        .join(' ');
      throw new Error(`表达式末尾有多余内容: ${remaining}`);
    }
  }
}
