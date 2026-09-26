/**
 * 单元测试 — 记录列表筛选/排序纯逻辑（从 RecordList.tsx 抽出的 filter-logic）。
 *
 * 覆盖：筛选行 → JsonLogic 转换（各操作符）、filter JSON 组装（AND 组合、
 * 全文搜索、空值忽略）、按字段类型的可用操作符与默认操作符。
 */

import { describe, it, expect } from 'vitest';
import {
  NO_VALUE_OPERATORS,
  buildFilterStr,
  filterRowToJsonLogic,
  getDefaultOperator,
  getOperatorsForType,
  type FilterRow,
} from './filter-logic.js';

describe('filterRowToJsonLogic', () => {
  it('等值/不等值', () => {
    expect(filterRowToJsonLogic('status', 'eq', 'A')).toEqual({ '==': [{ var: 'status' }, 'A'] });
    expect(filterRowToJsonLogic('status', 'ne', 'A')).toEqual({ '!=': [{ var: 'status' }, 'A'] });
  });

  it('包含/不包含（后端 JSONB string_contains）', () => {
    expect(filterRowToJsonLogic('name', 'contains', 'ab')).toEqual({
      in: ['ab', { var: 'name' }],
    });
    expect(filterRowToJsonLogic('name', 'not_contains', 'ab')).toEqual({
      '!': { in: ['ab', { var: 'name' }] },
    });
  });

  it('数值比较', () => {
    expect(filterRowToJsonLogic('qty', 'gt', 10)).toEqual({ '>': [{ var: 'qty' }, 10] });
    expect(filterRowToJsonLogic('qty', 'lte', 10)).toEqual({ '<=': [{ var: 'qty' }, 10] });
  });

  it('空值判断（无需值）', () => {
    expect(filterRowToJsonLogic('owner', 'is_empty')).toEqual({ '!': { var: 'owner' } });
    expect(filterRowToJsonLogic('owner', 'is_not_empty')).toEqual({ '!!': { var: 'owner' } });
    expect(NO_VALUE_OPERATORS).toContain('is_empty');
  });

  it('属于/不属于：标量自动包装为数组', () => {
    expect(filterRowToJsonLogic('status', 'in', 'A')).toEqual({
      in: [{ var: 'status' }, ['A']],
    });
    expect(filterRowToJsonLogic('status', 'in', ['A', 'B'])).toEqual({
      in: [{ var: 'status' }, ['A', 'B']],
    });
  });
});

describe('buildFilterStr', () => {
  const row = (over: Partial<FilterRow> = {}): FilterRow => ({
    field: 'status',
    operator: 'eq',
    value: 'A',
    ...over,
  });

  it('无条件 → undefined（不过滤）', () => {
    expect(buildFilterStr([], '', undefined)).toBeUndefined();
  });

  it('单条件 → 直接输出该规则', () => {
    expect(buildFilterStr([row()], '', undefined)).toBe(
      JSON.stringify({ '==': [{ var: 'status' }, 'A'] }),
    );
  });

  it('多条件 → AND 组合', () => {
    const out = buildFilterStr(
      [row(), row({ field: 'qty', operator: 'gt', value: 3 })],
      '',
      undefined,
    );
    expect(JSON.parse(out!)).toEqual({
      and: [{ '==': [{ var: 'status' }, 'A'] }, { '>': [{ var: 'qty' }, 3] }],
    });
  });

  it('全文搜索并入条件（首个文本字段 contains）', () => {
    const out = buildFilterStr([], 'abc', { apiName: 'name' });
    expect(JSON.parse(out!)).toEqual({ in: ['abc', { var: 'name' }] });
  });

  it('无值且需要值的行被忽略；无需值的行保留', () => {
    const out = buildFilterStr(
      [row({ value: '' }), row({ field: 'owner', operator: 'is_empty' })],
      '',
      undefined,
    );
    expect(JSON.parse(out!)).toEqual({ '!': { var: 'owner' } });
  });
});

describe('操作符推导', () => {
  it('文本/数值/日期/选择各有对应操作符集合', () => {
    expect(getOperatorsForType('text')).toContain('contains');
    expect(getOperatorsForType('number')).toContain('gt');
    expect(getOperatorsForType('date')).toContain('gte');
    expect(getOperatorsForType('single_select')).toContain('in');
    expect(getOperatorsForType('multi_select')).toEqual(['contains', 'is_empty', 'is_not_empty']);
  });

  it('默认操作符：文本用 contains，其余 eq', () => {
    expect(getDefaultOperator('text')).toBe('contains');
    expect(getDefaultOperator('multi_select')).toBe('contains');
    expect(getDefaultOperator('number')).toBe('eq');
  });
});
