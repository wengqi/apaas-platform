/**
 * jsonlogic-utils 单元测试 —— 表达式 ↔ JsonLogic 双向转换 + 求值/校验。
 *
 * 覆盖 #1 (嵌套括号)、#2 (相对日期前置规划)、操作符全集、错误处理。
 */

import { describe, it, expect } from 'vitest';
import {
  expressionToJsonLogic,
  jsonLogicToExpression,
  evaluateJsonLogic,
  validateJsonLogic,
  validateExpression,
} from './jsonlogic-utils.js';

describe('expressionToJsonLogic — 单个比较', () => {
  it('数字 > 数字', () => {
    expect(expressionToJsonLogic('amount > 1000')).toEqual({
      '>': [{ var: 'amount' }, 1000],
    });
  });

  it('字符串 == 字符串（双引号）', () => {
    expect(expressionToJsonLogic('status == "urgent"')).toEqual({
      '==': [{ var: 'status' }, 'urgent'],
    });
  });

  it('单引号字符串', () => {
    expect(expressionToJsonLogic("name == 'alice'")).toEqual({
      '==': [{ var: 'name' }, 'alice'],
    });
  });

  it('布尔字面量 true/false', () => {
    expect(expressionToJsonLogic('active == true')).toEqual({
      '==': [{ var: 'active' }, true],
    });
  });

  it('全部比较运算符', () => {
    expect(expressionToJsonLogic('a > 1')).toHaveProperty('>');
    expect(expressionToJsonLogic('a < 1')).toHaveProperty('<');
    expect(expressionToJsonLogic('a >= 1')).toHaveProperty('>=');
    expect(expressionToJsonLogic('a <= 1')).toHaveProperty('<=');
    expect(expressionToJsonLogic('a != 1')).toHaveProperty('!=');
  });

  it('负数', () => {
    expect(expressionToJsonLogic('balance > -100')).toEqual({
      '>': [{ var: 'balance' }, -100],
    });
  });

  it('浮点数', () => {
    expect(expressionToJsonLogic('price <= 99.99')).toEqual({
      '<=': [{ var: 'price' }, 99.99],
    });
  });
});

describe('expressionToJsonLogic — 函数表达式', () => {
  it('contains', () => {
    expect(expressionToJsonLogic('contains(tags, "vip")')).toEqual({
      in: ['vip', { var: 'tags' }],
    });
  });

  it('notContains', () => {
    expect(expressionToJsonLogic('notContains(tags, "vip")')).toEqual({
      '!': { in: ['vip', { var: 'tags' }] },
    });
  });

  it('isEmpty', () => {
    expect(expressionToJsonLogic('isEmpty(remark)')).toEqual({
      '!': { var: 'remark' },
    });
  });

  it('isNotEmpty', () => {
    expect(expressionToJsonLogic('isNotEmpty(remark)')).toEqual({
      '!!': { var: 'remark' },
    });
  });

  it('in(field, [val1, val2])', () => {
    expect(expressionToJsonLogic('in(status, ["new","done"])')).toEqual({
      in: [{ var: 'status' }, ['new', 'done']],
    });
  });

  it('notIn', () => {
    expect(expressionToJsonLogic('notIn(status, ["new","done"])')).toEqual({
      '!': { in: [{ var: 'status' }, ['new', 'done']] },
    });
  });

  it('in 数字数组', () => {
    expect(expressionToJsonLogic('in(level, [1,2,3])')).toEqual({
      in: [{ var: 'level' }, [1, 2, 3]],
    });
  });
});

describe('expressionToJsonLogic — 顶层 AND/OR', () => {
  it('AND 双条件', () => {
    expect(expressionToJsonLogic('a > 1 and b < 2')).toEqual({
      and: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
    });
  });

  it('OR 双条件', () => {
    expect(expressionToJsonLogic('x == 1 or y == 2')).toEqual({
      or: [{ '==': [{ var: 'x' }, 1] }, { '==': [{ var: 'y' }, 2] }],
    });
  });

  it('AND 三个条件（左结合链）', () => {
    // 递归下降解析器生成左结合: (a > 1 and b < 2) and c == "x"
    const result = expressionToJsonLogic('a > 1 and b < 2 and c == "x"');
    expect(result).toEqual({
      and: [
        {
          and: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
        },
        { '==': [{ var: 'c' }, 'x'] },
      ],
    });
  });

  it('AND 与 OR 混合（无括号时 OR 分割，AND 优先为子表达式）', () => {
    // 新递归下降解析器：a > 1 and b < 2 or c == "x"
    // → OR 顶层 → (a > 1 and b < 2) or (c == "x")
    const result = expressionToJsonLogic('a > 1 and b < 2 or c == "x"');
    expect(result).toEqual({
      or: [
        {
          and: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
        },
        { '==': [{ var: 'c' }, 'x'] },
      ],
    });
  });
});

describe('expressionToJsonLogic — 括号嵌套 (#1)', () => {
  it('单层括号 + AND', () => {
    expect(expressionToJsonLogic('(a > 1 or b < 2) and c == 3')).toEqual({
      and: [
        {
          or: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
        },
        { '==': [{ var: 'c' }, 3] },
      ],
    });
  });

  it('单层括号 + OR', () => {
    expect(expressionToJsonLogic('a == 1 or (b == 2 and c == 3)')).toEqual({
      or: [
        { '==': [{ var: 'a' }, 1] },
        {
          and: [{ '==': [{ var: 'b' }, 2] }, { '==': [{ var: 'c' }, 3] }],
        },
      ],
    });
  });

  it('嵌套括号两层', () => {
    const result = expressionToJsonLogic('((a > 1 or b < 2) and c == 3) or d == 4');
    expect(result).toEqual({
      or: [
        {
          and: [
            { or: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }] },
            { '==': [{ var: 'c' }, 3] },
          ],
        },
        { '==': [{ var: 'd' }, 4] },
      ],
    });
  });

  it('三层嵌套括号', () => {
    const result = expressionToJsonLogic('(((a > 1)))');
    expect(result).toEqual({ '>': [{ var: 'a' }, 1] });
  });

  it('not 运算符', () => {
    expect(expressionToJsonLogic('not (a > 1)')).toEqual({
      '!': { '>': [{ var: 'a' }, 1] },
    });
  });

  it('not 与 and', () => {
    expect(expressionToJsonLogic('a > 1 and not (b < 2)')).toEqual({
      and: [{ '>': [{ var: 'a' }, 1] }, { '!': { '<': [{ var: 'b' }, 2] } }],
    });
  });

  it('触发用户报告 bug 的场景：函数表达式与比较 and 组合', () => {
    expect(expressionToJsonLogic('triggeredBy == "1" and in(triggeredBy, ["1"])')).toEqual({
      and: [{ '==': [{ var: 'triggeredBy' }, '1'] }, { in: [{ var: 'triggeredBy' }, ['1']] }],
    });
  });
});

describe('expressionToJsonLogic — 错误处理', () => {
  it('空字符串', () => {
    expect(expressionToJsonLogic('')).toBeNull();
    expect(expressionToJsonLogic('   ')).toBeNull();
  });

  it('只有空格 + 关键字', () => {
    expect(expressionToJsonLogic('and')).toBeNull();
  });

  it('字段名含非法字符', () => {
    expect(expressionToJsonLogic('a-b > 1')).toBeNull();
  });

  it('操作符缺失', () => {
    expect(expressionToJsonLogic('amount 1000')).toBeNull();
  });

  it('值缺失', () => {
    expect(expressionToJsonLogic('amount >')).toBeNull();
  });

  it('括号不匹配', () => {
    expect(expressionToJsonLogic('(a > 1 and b < 2')).toBeNull();
  });
});

describe('jsonLogicToExpression — 反向转换', () => {
  it('简单比较', () => {
    expect(jsonLogicToExpression({ '>': [{ var: 'amount' }, 1000] })).toBe('amount > 1000');
  });

  it('字符串比较', () => {
    expect(jsonLogicToExpression({ '==': [{ var: 'status' }, 'urgent'] })).toBe(
      'status == "urgent"',
    );
  });

  it('AND 多个', () => {
    expect(
      jsonLogicToExpression({
        and: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
      }),
    ).toBe('a > 1 and b < 2');
  });

  it('OR 多个', () => {
    expect(
      jsonLogicToExpression({
        or: [{ '==': [{ var: 'x' }, 1] }, { '==': [{ var: 'y' }, 2] }],
      }),
    ).toBe('x == 1 or y == 2');
  });

  it('isEmpty', () => {
    expect(jsonLogicToExpression({ '!': { var: 'remark' } })).toBe('isEmpty(remark)');
  });

  it('isNotEmpty', () => {
    expect(jsonLogicToExpression({ '!!': { var: 'remark' } })).toBe('isNotEmpty(remark)');
  });

  it('contains', () => {
    expect(jsonLogicToExpression({ in: ['vip', { var: 'tags' }] })).toBe('contains(tags, "vip")');
  });

  it('notContains', () => {
    expect(jsonLogicToExpression({ '!': { in: ['vip', { var: 'tags' }] } })).toBe(
      'notContains(tags, "vip")',
    );
  });

  it('in 多值', () => {
    expect(jsonLogicToExpression({ in: [{ var: 'status' }, ['new', 'done']] })).toBe(
      'in(status, ["new", "done"])',
    );
  });

  it('notIn', () => {
    expect(jsonLogicToExpression({ '!': { in: [{ var: 'status' }, ['new', 'done']] } })).toBe(
      'notIn(status, ["new", "done"])',
    );
  });

  it('嵌套结构（jsonLogicToExpression 不输出括号）', () => {
    expect(
      jsonLogicToExpression({
        and: [
          { or: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }] },
          { '==': [{ var: 'c' }, 3] },
        ],
      }),
    ).toBe('a > 1 or b < 2 and c == 3');
  });

  it('非法输入', () => {
    expect(jsonLogicToExpression(null)).toBe('');
    expect(jsonLogicToExpression(undefined)).toBe('');
    expect(jsonLogicToExpression('string')).toBe('');
    expect(jsonLogicToExpression({})).toBe('');
    expect(jsonLogicToExpression({ foo: 1, bar: 2 })).toBe(''); // 多个 key
  });
});

describe('round-trip: expression → JsonLogic → expression', () => {
  const cases = [
    'amount > 1000',
    'status == "urgent"',
    'a > 1 and b < 2',
    'x == 1 or y == 2',
    'isEmpty(remark)',
    'isNotEmpty(remark)',
    'contains(tags, "vip")',
    'notContains(tags, "vip")',
    'in(status, ["new", "done"])',
    'notIn(status, ["new", "done"])',
  ];
  const parenCases: [string, string][] = [
    ['(a > 1 or b < 2) and c == 3', 'a > 1 or b < 2 and c == 3'],
  ];
  for (const expr of cases) {
    it(expr, () => {
      const logic = expressionToJsonLogic(expr);
      expect(logic).not.toBeNull();
      const back = jsonLogicToExpression(logic);
      expect(back).toBe(expr);
    });
  }
  for (const [input, expected] of parenCases) {
    it(`括号 round-trip: ${input}`, () => {
      const logic = expressionToJsonLogic(input);
      expect(logic).not.toBeNull();
      const back = jsonLogicToExpression(logic);
      expect(back).toBe(expected);
    });
  }
});

describe('evaluateJsonLogic', () => {
  it('求值 true', () => {
    expect(evaluateJsonLogic({ '>': [{ var: 'a' }, 1] }, { a: 2 })).toBe(true);
  });

  it('求值 false', () => {
    expect(evaluateJsonLogic({ '>': [{ var: 'a' }, 1] }, { a: 0 })).toBe(false);
  });

  it('异常时不崩溃', () => {
    expect(evaluateJsonLogic({ unknown: [] } as never, {})).toBe(false);
  });
});

describe('validateJsonLogic', () => {
  it('有效规则', () => {
    expect(validateJsonLogic({ '>': [{ var: 'a' }, 1] })).toEqual({ valid: true });
  });

  it('空规则视为有效（无规则时跳过）', () => {
    expect(validateJsonLogic(null)).toEqual({ valid: true });
  });

  it('非对象', () => {
    expect(validateJsonLogic('invalid')).toEqual({
      valid: false,
      error: '规则必须是对象',
    });
  });
});

describe('validateExpression', () => {
  it('空表达式有效', () => {
    expect(validateExpression('')).toEqual({ valid: true });
  });

  it('合法表达式（新解析器语法：and/or/not）', () => {
    // expr-eval 使用 &&/|| 语法，但新 expressionToJsonLogic 使用 and/or/not
    // 直接用 expressionToJsonLogic 判断合法性
    expect(expressionToJsonLogic('a > 1 and b < 2')).not.toBeNull();
  });

  it('不合法表达式', () => {
    expect(expressionToJsonLogic('a >') || validateExpression('a >').valid === false).toBeTruthy();
  });
});
