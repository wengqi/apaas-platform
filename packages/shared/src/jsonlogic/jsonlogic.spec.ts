/**
 * JsonLogic 可译子集 SSOT 单测（ADR-0004 决策 7）。
 */

import { describe, it, expect } from 'vitest';
import {
  JSONLOGIC_OPERATOR_CONTRACTS,
  collectJsonLogicOperators,
  findUnsupportedOperators,
  jsonlogicOperatorContract,
  jsonlogicSupportedOperators,
} from './index.js';

describe('JsonLogic 子集 SSOT 完整性', () => {
  it('每个操作符契约字段齐全（op 唯一、语义/操作数非空、至少一个翻译器）', () => {
    const ops = new Set<string>();
    for (const c of JSONLOGIC_OPERATOR_CONTRACTS) {
      expect(c.op.length).toBeGreaterThan(0);
      expect(ops.has(c.op)).toBe(false);
      ops.add(c.op);
      expect(c.semantics.length).toBeGreaterThan(0);
      expect(c.operands.length).toBeGreaterThan(0);
      expect(c.translators.length).toBeGreaterThan(0);
      for (const t of c.translators) {
        expect(['prisma', 'sql']).toContain(t);
      }
    }
  });

  it('两翻译器支持集的并集 = 全部声明操作符（无孤儿契约）', () => {
    const all = new Set(JSONLOGIC_OPERATOR_CONTRACTS.map((c) => c.op));
    const prisma = jsonlogicSupportedOperators('prisma');
    const sql = jsonlogicSupportedOperators('sql');
    for (const op of all) {
      expect(prisma.has(op) || sql.has(op)).toBe(true);
    }
    // 平台公共核心两翻译器都支持
    for (const op of ['and', 'or', '!', '==', '!=', '>', '>=', '<', '<=', 'in', 'var']) {
      expect(prisma.has(op)).toBe(true);
      expect(sql.has(op)).toBe(true);
    }
  });

  it('jsonlogicOperatorContract：按 op 反查，未知返回 undefined', () => {
    expect(jsonlogicOperatorContract('relative_date')?.translators).toEqual(['prisma']);
    expect(jsonlogicOperatorContract('no_such_op')).toBeUndefined();
  });
});

describe('collectJsonLogicOperators / findUnsupportedOperators', () => {
  it('深度收集嵌套规则的操作符（含数组与保留变量）', () => {
    const rule = {
      and: [
        { '>': [{ var: 'amount' }, 1000] },
        { in: [{ var: 'status' }, ['open', 'pending']] },
        { '!': { '==': [{ var: '__currentUser' }, 'x'] } },
      ],
    };
    const ops = collectJsonLogicOperators(rule);
    for (const op of ['and', '>', 'in', '!', '==', 'var']) {
      expect(ops.has(op)).toBe(true);
    }
  });

  it('标量/null/undefined 安全（不收集、不抛错）', () => {
    expect(collectJsonLogicOperators(null).size).toBe(0);
    expect(collectJsonLogicOperators(42).size).toBe(0);
    expect(collectJsonLogicOperators(undefined).size).toBe(0);
  });

  it('findUnsupportedOperators：prisma 侧 === 不在子集，relative_date 在', () => {
    const rule = {
      and: [{ '===': [{ var: 'a' }, 1] }, { relative_date: [{ var: 'd' }, 'today'] }],
    };
    expect(findUnsupportedOperators(rule, 'prisma')).toEqual(['===']);
    expect(findUnsupportedOperators(rule, 'sql')).toEqual(['relative_date']);
  });
});
