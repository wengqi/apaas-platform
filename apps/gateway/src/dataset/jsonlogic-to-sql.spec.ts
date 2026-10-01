/**
 * jsonlogic-to-sql 单测（G5）——支持子集 / 不支持返回 null / 注入防护。
 */

import { describe, it, expect } from 'vitest';
import { translateJsonLogicToSql, NUMERIC_TEXT_RE } from './jsonlogic-to-sql.js';

describe('支持子集', () => {
  it('== 字符串字面量 → 文本相等 + 参数绑定', () => {
    const r = translateJsonLogicToSql({ '==': [{ var: 'region' }, 'east'] }, 'data');
    expect(r).not.toBeNull();
    expect(r!.text).toBe(`data->>'region' = $1`);
    expect(r!.params).toEqual(['east']);
  });

  it('!= 与 null 字面量 → IS NOT NULL（缺失字段语义对齐 JS）', () => {
    const r = translateJsonLogicToSql({ '!=': [{ var: 'region' }, null] }, 'data');
    expect(r!.text).toBe(`data->>'region' IS NOT NULL`);
  });

  it('== null → IS NULL', () => {
    const r = translateJsonLogicToSql({ '==': [{ var: 'x' }, null] }, 'data');
    expect(r!.text).toBe(`data->>'x' IS NULL`);
  });

  it('数字字面量排序比较 → regex 守卫 numeric cast', () => {
    const r = translateJsonLogicToSql({ '>': [{ var: 'amount' }, 100] }, 'data');
    expect(r!.text).toBe(
      `CASE WHEN data->>'amount' ~ '${NUMERIC_TEXT_RE}' THEN data->>'amount'::numeric END > $1`,
    );
    expect(r!.params).toEqual([100]);
  });

  and_or_tests();
  in_test();
  reversed_operand();
});

function and_or_tests(): void {
  it('and/or 嵌套组合', () => {
    const rule = {
      and: [
        { '==': [{ var: 'region' }, 'east'] },
        { or: [{ '>': [{ var: 'amount' }, 10] }, { '==': [{ var: 'level' }, 'A'] }] },
      ],
    };
    const r = translateJsonLogicToSql(rule, 'data');
    expect(r).not.toBeNull();
    expect(r!.text).toContain(' AND ');
    expect(r!.text).toContain(' OR ');
    expect(r!.params).toHaveLength(3);
  });

  it('! 取反', () => {
    const r = translateJsonLogicToSql({ '!': [{ '==': [{ var: 'x' }, 'a'] }] }, 'data');
    expect(r!.text).toBe(`NOT (data->>'x' = $1)`);
  });
}

function in_test(): void {
  it('in 数组成员', () => {
    const r = translateJsonLogicToSql({ in: [{ var: 'status' }, ['A', 'B', 'C']] }, 'data');
    expect(r!.text).toBe(`data->>'status' IN ($1, $2, $3)`);
    expect(r!.params).toEqual(['A', 'B', 'C']);
  });
}

function reversed_operand(): void {
  it('相等比较操作数换序（字面量在前）', () => {
    const r = translateJsonLogicToSql({ '==': ['east', { var: 'region' }] }, 'data');
    expect(r!.text).toBe(`data->>'region' = $1`);
  });
}

describe('不支持形状 → null（调用方兜底）', () => {
  it('裸 var（真值语义，JS/SQL 不一致）', () => {
    expect(translateJsonLogicToSql({ var: 'x' }, 'data')).toBeNull();
  });

  it('字段对字段比较（NULL==NULL 语义 drift）', () => {
    expect(translateJsonLogicToSql({ '==': [{ var: 'a' }, { var: 'b' }] }, 'data')).toBeNull();
  });

  it('未知运算符（map/filter/+ 等）', () => {
    expect(translateJsonLogicToSql({ map: [{ var: 'x' }, { '+': [1, 2] }] }, 'data')).toBeNull();
    expect(translateJsonLogicToSql({ '+': [{ var: 'a' }, 1] }, 'data')).toBeNull();
  });

  it('数组/对象字面量与字符串插值', () => {
    expect(translateJsonLogicToSql({ '==': [{ var: 'a' }, { cat: [1, 2] }] }, 'data')).toBeNull();
  });

  it('非法字段键（防注入）', () => {
    expect(
      translateJsonLogicToSql({ '==': [{ var: "x'; DROP TABLE users; --" }, '1'] }, 'data'),
    ).toBeNull();
    expect(translateJsonLogicToSql({ '==': [{ var: 'a b' }, '1'] }, 'data')).toBeNull();
  });
});

describe('参数偏移（startParamIndex）', () => {
  it('调用方已占用参数位后 $n 连续', () => {
    const r = translateJsonLogicToSql(
      { and: [{ '==': [{ var: 'a' }, 'x'] }, { '>': [{ var: 'b' }, 5] }] },
      'data',
      2,
    );
    expect(r!.text).toContain('= $3');
    expect(r!.text).toContain('> $4');
    // 返回的 params 不含占位
    expect(r!.params).toEqual(['x', 5]);
  });
});
