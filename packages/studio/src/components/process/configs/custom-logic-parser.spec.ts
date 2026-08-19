/**
 * custom-logic-parser 单元测试 —— 飞书风格条件序号引用表达式解析。
 *
 * 覆盖：
 * - 单/多条件 AND/OR
 * - 括号嵌套
 * - not 运算符
 * - 错误处理（空表达式、未知关键字、序号越界、括号不匹配等）
 * - 默认逻辑表达式生成
 * - 序号校验
 */

import { describe, it, expect } from 'vitest';
import {
  parseCustomLogic,
  generateDefaultLogic,
  validateCustomLogic,
} from './custom-logic-parser.js';

const sampleConditions = [
  { '>': [{ var: 'amount' }, 1000] }, // 1
  { '==': [{ var: 'status' }, 'urgent'] }, // 2
  { '<': [{ var: 'count' }, 5] }, // 3
  { in: [{ var: 'tag' }, ['vip', 'gold']] }, // 4
];

describe('parseCustomLogic — 基本运算', () => {
  it('单条件', () => {
    const { logic, error } = parseCustomLogic('1', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({ '>': [{ var: 'amount' }, 1000] });
  });

  it('AND 两个条件', () => {
    const { logic, error } = parseCustomLogic('1 and 2', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      and: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
    });
  });

  it('OR 两个条件', () => {
    const { logic, error } = parseCustomLogic('1 or 2', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      or: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
    });
  });

  it('AND 三个条件（左结合链）', () => {
    const { logic, error } = parseCustomLogic('1 and 2 and 3', sampleConditions);
    expect(error).toBeNull();
    // 左结合: (1 and 2) and 3
    expect(logic).toEqual({
      and: [
        {
          and: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
        },
        { '<': [{ var: 'count' }, 5] },
      ],
    });
  });
});

describe('parseCustomLogic — 运算符优先级', () => {
  it('AND 优先于 OR', () => {
    // 1 and 2 or 3 → 1 and 2 先算，再 or 3
    const { logic, error } = parseCustomLogic('1 and 2 or 3', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      or: [
        {
          and: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
        },
        { '<': [{ var: 'count' }, 5] },
      ],
    });
  });

  it('OR 后再 AND', () => {
    // 1 or 2 and 3 → 2 and 3 先算，再 or 1
    const { logic, error } = parseCustomLogic('1 or 2 and 3', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      or: [
        { '>': [{ var: 'amount' }, 1000] },
        {
          and: [{ '==': [{ var: 'status' }, 'urgent'] }, { '<': [{ var: 'count' }, 5] }],
        },
      ],
    });
  });
});

describe('parseCustomLogic — 括号', () => {
  it('括号改变优先级：(1 or 2) and 3', () => {
    const { logic, error } = parseCustomLogic('(1 or 2) and 3', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      and: [
        {
          or: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
        },
        { '<': [{ var: 'count' }, 5] },
      ],
    });
  });

  it('嵌套括号：(1 and (2 or 3))', () => {
    const { logic, error } = parseCustomLogic('1 and (2 or 3)', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      and: [
        { '>': [{ var: 'amount' }, 1000] },
        {
          or: [{ '==': [{ var: 'status' }, 'urgent'] }, { '<': [{ var: 'count' }, 5] }],
        },
      ],
    });
  });

  it('多层括号', () => {
    const { logic, error } = parseCustomLogic('((1 or 2) and 3) or 4', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      or: [
        {
          and: [
            {
              or: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
            },
            { '<': [{ var: 'count' }, 5] },
          ],
        },
        { in: [{ var: 'tag' }, ['vip', 'gold']] },
      ],
    });
  });
});

describe('parseCustomLogic — not 运算符', () => {
  it('not 1', () => {
    const { logic, error } = parseCustomLogic('not 1', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({ '!': { '>': [{ var: 'amount' }, 1000] } });
  });

  it('not 与 and', () => {
    const { logic, error } = parseCustomLogic('1 and not 2', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      and: [{ '>': [{ var: 'amount' }, 1000] }, { '!': { '==': [{ var: 'status' }, 'urgent'] } }],
    });
  });

  it('双重 not', () => {
    const { logic, error } = parseCustomLogic('not not 1', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({ '!': { '!': { '>': [{ var: 'amount' }, 1000] } } });
  });

  it('not 与括号', () => {
    const { logic, error } = parseCustomLogic('not (1 or 2)', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      '!': {
        or: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
      },
    });
  });
});

describe('parseCustomLogic — 大小写不敏感', () => {
  it('AND 大写', () => {
    const { logic, error } = parseCustomLogic('1 AND 2', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({
      and: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
    });
  });

  it('NOT 大写', () => {
    const { logic, error } = parseCustomLogic('NOT 1', sampleConditions);
    expect(error).toBeNull();
    expect(logic).toEqual({ '!': { '>': [{ var: 'amount' }, 1000] } });
  });
});

describe('parseCustomLogic — 错误处理', () => {
  it('空表达式', () => {
    const { logic, error } = parseCustomLogic('', sampleConditions);
    expect(error).toBe('表达式不能为空');
    expect(logic).toBeNull();
  });

  it('空条件数组', () => {
    const { logic, error } = parseCustomLogic('1', []);
    expect(error).toBe('没有可引用的条件');
    expect(logic).toBeNull();
  });

  it('未知关键字', () => {
    const { error } = parseCustomLogic('1 xor 2', sampleConditions);
    expect(error).toContain('未知关键字');
  });

  it('非法字符', () => {
    const { error } = parseCustomLogic('1 @ 2', sampleConditions);
    expect(error).toBeTruthy();
  });

  it('条件序号 0', () => {
    const { error } = parseCustomLogic('0', sampleConditions);
    expect(error).toContain('超出范围');
  });

  it('条件序号越界', () => {
    const { error } = parseCustomLogic('5', sampleConditions);
    expect(error).toContain('超出范围');
  });

  it('括号不匹配', () => {
    const { error } = parseCustomLogic('(1 and 2', sampleConditions);
    expect(error).toBeTruthy();
  });

  it('末尾多余内容', () => {
    // 'extra' 会被 tokenize 当作未知关键字抛出，无法走到 expectEnd
    const { error } = parseCustomLogic('1 and 2 extra', sampleConditions);
    expect(error).toContain('未知关键字');
  });

  it('多余数字（如末尾孤立数字）', () => {
    const { error } = parseCustomLogic('1 and 2 3', sampleConditions);
    expect(error).toBeTruthy();
  });

  it('只有运算符', () => {
    const { error } = parseCustomLogic('and', sampleConditions);
    expect(error).toBeTruthy();
  });

  it('不完整的 not', () => {
    const { error } = parseCustomLogic('not', sampleConditions);
    expect(error).toBeTruthy();
  });
});

describe('generateDefaultLogic', () => {
  it('条件数 = 0', () => {
    expect(generateDefaultLogic(0)).toBe('');
  });

  it('条件数 = 1', () => {
    expect(generateDefaultLogic(1)).toBe('1');
  });

  it('条件数 = 3', () => {
    expect(generateDefaultLogic(3)).toBe('1 and 2 and 3');
  });

  it('条件数 = 5', () => {
    expect(generateDefaultLogic(5)).toBe('1 and 2 and 3 and 4 and 5');
  });

  it('负数（防御）', () => {
    expect(generateDefaultLogic(-1)).toBe('');
  });
});

describe('validateCustomLogic', () => {
  it('合法且在范围内', () => {
    expect(validateCustomLogic('1 and 2', 4)).toEqual({ valid: true });
  });

  it('空表达式', () => {
    const result = validateCustomLogic('', 4);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('表达式不能为空');
  });

  it('无序号引用', () => {
    const result = validateCustomLogic('true', 4);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('未引用');
  });

  it('序号超出上限', () => {
    const result = validateCustomLogic('5', 4);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('超出范围');
  });

  it('序号小于 1', () => {
    const result = validateCustomLogic('0', 4);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('超出范围');
  });

  it('序号等于上限', () => {
    expect(validateCustomLogic('4', 4).valid).toBe(true);
  });

  it('复杂表达式合法', () => {
    expect(validateCustomLogic('(1 and 2) or (3 and not 4)', 4).valid).toBe(true);
  });

  it('语法错误', () => {
    expect(validateCustomLogic('1 xor 2', 4).valid).toBe(false);
  });
});
