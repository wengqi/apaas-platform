/**
 * jsonlogic-utils 单元测试 —— jsonLogicToExpression（只读展示用）。
 *
 * 表达式文本编辑模式已移除，仅保留 jsonLogicToExpression 用于画布条件文本展示。
 */

import { describe, it, expect } from 'vitest';
import { jsonLogicToExpression } from './jsonlogic-utils.js';

describe('jsonLogicToExpression', () => {
  it('简单比较', () => {
    expect(jsonLogicToExpression({ '>': [{ var: 'amount' }, 1000] })).toBe('amount > 1000');
  });

  it('字符串比较', () => {
    expect(jsonLogicToExpression({ '==': [{ var: 'status' }, 'urgent'] })).toBe(
      'status == "urgent"',
    );
  });

  it('AND', () => {
    expect(
      jsonLogicToExpression({
        and: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
      }),
    ).toBe('a > 1 and b < 2');
  });

  it('OR', () => {
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

  it('contains (value-first)', () => {
    expect(jsonLogicToExpression({ in: ['vip', { var: 'tags' }] })).toBe('contains(tags, "vip")');
  });

  it('notContains (value-first)', () => {
    expect(jsonLogicToExpression({ '!': { in: ['vip', { var: 'tags' }] } })).toBe(
      'notContains(tags, "vip")',
    );
  });

  it('in (field-first, array)', () => {
    expect(jsonLogicToExpression({ in: [{ var: 'status' }, ['new', 'done']] })).toBe(
      'in(status, ["new", "done"])',
    );
  });

  it('notIn (field-first, array)', () => {
    expect(jsonLogicToExpression({ '!': { in: [{ var: 'status' }, ['new', 'done']] } })).toBe(
      'notIn(status, ["new", "done"])',
    );
  });

  it('非法输入', () => {
    expect(jsonLogicToExpression(null)).toBe('');
    expect(jsonLogicToExpression(undefined)).toBe('');
    expect(jsonLogicToExpression('string')).toBe('');
    expect(jsonLogicToExpression({})).toBe('');
  });
});
