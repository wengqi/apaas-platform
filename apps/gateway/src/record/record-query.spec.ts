/**
 * 单元测试 — 记录查询助手（评审 A-H1）。
 *
 * 覆盖：containment 提取（GIN 下推前提）、排序片段生成（类型转换 + 白名单）、
 * 内存比较器（数值语义 + NULLS LAST）。
 */

import { describe, it, expect } from 'vitest';
import {
  buildFieldOrderSql,
  compareFieldValues,
  extractContainmentFilter,
  parseSortSpec,
  type SortableField,
} from './record-query.js';

const FIELDS: SortableField[] = [
  { apiName: 'amount', type: 'number' },
  { apiName: 'status', type: 'single_select' },
  { apiName: 'name', type: 'text' },
  { apiName: 'created_at_biz', type: 'date_time' },
];

describe('extractContainmentFilter', () => {
  it('单个等值条件 → 全量下推（rest=null）', () => {
    const r = extractContainmentFilter({ '==': [{ var: 'status' }, 'PENDING'] });
    expect(r).toEqual({ containment: { status: 'PENDING' }, rest: null });
  });

  it('AND 树内的多个等值条件 → 合并为一个包含对象', () => {
    const r = extractContainmentFilter({
      and: [{ '==': [{ var: 'status' }, 'PENDING'] }, { '==': [{ var: 'region' }, 'east'] }],
    });
    expect(r?.containment).toEqual({ status: 'PENDING', region: 'east' });
    expect(r?.rest).toBeNull();
  });

  it('混合运算符 → 等值可下推，比较运算保留在 rest', () => {
    const rule = {
      and: [{ '==': [{ var: 'status' }, 'PENDING'] }, { '>': [{ var: 'amount' }, 100] }],
    };
    const r = extractContainmentFilter(rule);
    expect(r?.containment).toEqual({ status: 'PENDING' });
    expect(r?.rest).toEqual({ '>': [{ var: 'amount' }, 100] });
  });

  it('OR 条件不可下推（无法表达为 AND 包含）', () => {
    const r = extractContainmentFilter({
      or: [{ '==': [{ var: 'status' }, 'A'] }, { '==': [{ var: 'status' }, 'B'] }],
    });
    expect(r).toBeNull();
  });

  it('点路径变量与 null 值不下推', () => {
    expect(extractContainmentFilter({ '==': [{ var: 'nested.field' }, 'x'] })).toBeNull();
    expect(extractContainmentFilter({ '==': [{ var: 'status' }, null] })).toBeNull();
  });

  it('LIKE（in substr）不下推', () => {
    expect(extractContainmentFilter({ in: ['sub', { var: 'name' }] })).toBeNull();
  });
});

describe('parseSortSpec', () => {
  it('解析方向与字段', () => {
    expect(parseSortSpec('amount:desc')).toEqual({ field: 'amount', dir: 'desc' });
    expect(parseSortSpec('amount:asc')).toEqual({ field: 'amount', dir: 'asc' });
  });

  it('缺省方向为 desc，非法字段名返回 null', () => {
    expect(parseSortSpec('amount')).toEqual({ field: 'amount', dir: 'desc' });
    expect(parseSortSpec('bad-name;DROP')).toBeNull();
  });

  it('兼容 AntD Table sorter 词形 ascend/descend', () => {
    expect(parseSortSpec('amount:ascend')).toEqual({ field: 'amount', dir: 'asc' });
    expect(parseSortSpec('amount:descend')).toEqual({ field: 'amount', dir: 'desc' });
  });
});

describe('buildFieldOrderSql', () => {
  it('数值字段 cast numeric + NULLS LAST（避免字典序 10 < 9）', () => {
    const sql = buildFieldOrderSql([{ field: 'amount', dir: 'desc' }], FIELDS);
    expect(sql).toBe("(r.data->>'amount')::numeric DESC NULLS LAST");
  });

  it('文本/选择字段直接取文本，日期保留文本比较', () => {
    expect(buildFieldOrderSql([{ field: 'status', dir: 'asc' }], FIELDS)).toBe(
      "r.data->>'status' ASC NULLS LAST",
    );
    expect(buildFieldOrderSql([{ field: 'created_at_biz', dir: 'asc' }], FIELDS)).toBe(
      "r.data->>'created_at_biz' ASC NULLS LAST",
    );
  });

  it('非白名单字段拒绝生成 SQL（防注入）', () => {
    expect(buildFieldOrderSql([{ field: 'secret', dir: 'asc' }], FIELDS)).toBeNull();
  });
});

describe('compareFieldValues', () => {
  it('数值型按数字语义比较', () => {
    expect(compareFieldValues(10, 9, 'number')).toBeGreaterThan(0);
    expect(compareFieldValues('10', '9', 'number')).toBeGreaterThan(0);
    expect(compareFieldValues(1000, 1000, 'number')).toBe(0);
  });

  it('文本型按字典序', () => {
    expect(compareFieldValues('a', 'b', 'text')).toBeLessThan(0);
  });

  it('空值恒排最后', () => {
    expect(compareFieldValues(null, 1, 'number')).toBeGreaterThan(0);
    expect(compareFieldValues(undefined, 'a', 'text')).toBeGreaterThan(0);
    expect(compareFieldValues('', 0, 'number')).toBeGreaterThan(0);
    expect(compareFieldValues(null, undefined, 'text')).toBe(0);
  });

  it('非数值内容视为缺失（NaN → 末尾）', () => {
    expect(compareFieldValues('abc', 5, 'number')).toBeGreaterThan(0);
  });
});
