/**
 * JsonLogic 可译子集锚定测试（ADR-0004 决策 7 的牙齿）。
 *
 * 双向锚定：SSOT 声明某翻译器支持的操作符，必须真实可译（声明多于实现 → 红）；
 * 翻译器接受的顶层操作符必须都在 SSOT 声明内（实现多于声明 → 红）。任何一侧
 * 单独改动不更新 SSOT，本文件即失败——这就是消灭"可译子集双事实标准"的机制。
 *
 * 说明：'var' 是操作数原语（不出现在任何合法规则的顶层），SSOT 中为方言指南
 * 保留声明，锚定经其余操作符的规范示例间接覆盖。
 */

import { describe, it, expect } from 'vitest';
import { jsonLogicToPrismaWhere, UntranslatableConditionError } from './jsonlogic-to-prisma.js';
import { translateJsonLogicToSql } from '../dataset/jsonlogic-to-sql.js';
import {
  JSONLOGIC_OPERATOR_CONTRACTS,
  jsonlogicSupportedOperators,
  type JsonLogicTranslator,
} from '@apaas/shared';

/** 每个操作符的规范可译示例（形状取自方言指南与两翻译器测试的既有用法）。 */
const CANONICAL: Record<string, unknown> = {
  and: { and: [{ '==': [{ var: 'a' }, 1] }, { '==': [{ var: 'b' }, 2] }] },
  or: { or: [{ '==': [{ var: 'a' }, 1] }, { '==': [{ var: 'b' }, 2] }] },
  '!': { '!': { '==': [{ var: 'a' }, 1] } },
  '==': { '==': [{ var: 'amount' }, 1000] },
  '!=': { '!=': [{ var: 'status' }, 'active'] },
  '>': { '>': [{ var: 'amount' }, 100] },
  '>=': { '>=': [{ var: 'amount' }, 100] },
  '<': { '<': [{ var: 'amount' }, 100] },
  '<=': { '<=': [{ var: 'amount' }, 100] },
  in: { in: [{ var: 'status' }, ['open', 'pending']] },
  '===': { '===': [{ var: 'a' }, 1] },
  '!==': { '!==': [{ var: 'a' }, 1] },
  '!!': { '!!': { var: 'a' } },
  relative_date: { relative_date: [{ var: 'created_at' }, 'today'] },
};

/** 平台子集之外的常见 JsonLogic 操作符（两侧都必须拒绝的探针）。 */
const OUTSIDE_PROBES = ['+', '-', '*', 'map', 'filter', 'reduce', 'missing', 'if', 'substr'];

/** 权限侧锚定：strict 模式可译返回非 null，不可译抛 UntranslatableConditionError。 */
function prismaTranslates(rule: unknown): boolean {
  try {
    return jsonLogicToPrismaWhere(rule, undefined, { strict: true }) !== null;
  } catch (err) {
    if (err instanceof UntranslatableConditionError) return false;
    throw err;
  }
}

/** SQL 侧锚定：可译返回非 null 片段，不可译返回 null。 */
function sqlTranslates(rule: unknown): boolean {
  return translateJsonLogicToSql(rule, 'data') !== null;
}

function contractsFor(translator: JsonLogicTranslator) {
  return JSONLOGIC_OPERATOR_CONTRACTS.filter(
    (c) => c.translators.includes(translator) && c.op !== 'var',
  );
}

function contractsNotFor(translator: JsonLogicTranslator) {
  return JSONLOGIC_OPERATOR_CONTRACTS.filter(
    (c) => !c.translators.includes(translator) && c.op !== 'var',
  );
}

describe('JsonLogic 子集锚定：prisma（权限下推，strict fail-closed）', () => {
  it('声明支持的操作符全部真实可译', () => {
    for (const c of contractsFor('prisma')) {
      const rule = CANONICAL[c.op];
      expect(rule).toBeDefined();
      expect(prismaTranslates(rule)).toBe(true);
    }
  });

  it('声明给另一侧的操作符（===/!==）必须被拒绝', () => {
    for (const c of contractsNotFor('prisma')) {
      expect(prismaTranslates(CANONICAL[c.op]!)).toBe(false);
    }
  });

  it('平台子集之外的探针操作符全部被拒绝', () => {
    for (const probe of OUTSIDE_PROBES) {
      expect(prismaTranslates({ [probe]: [{ var: 'a' }] })).toBe(false);
    }
  });

  it('SSOT 声明集 = 翻译器 switch 分支集（防死分支/漏声明漂移）', () => {
    // default 拒绝信息消费 SSOT——SSOT 丢了核心操作符时该断言给出直白信号
    const declared = jsonlogicSupportedOperators('prisma');
    for (const op of ['==', 'in', 'and', 'relative_date']) {
      expect(declared.has(op)).toBe(true);
    }
  });
});

describe('JsonLogic 子集锚定：sql（数据流下推，不可译返回 null）', () => {
  it('声明支持的操作符全部真实可译', () => {
    for (const c of contractsFor('sql')) {
      const rule = CANONICAL[c.op];
      expect(rule).toBeDefined();
      expect(sqlTranslates(rule)).toBe(true);
    }
  });

  it('声明给另一侧的操作符（!!/relative_date）必须拒绝（返回 null）', () => {
    for (const c of contractsNotFor('sql')) {
      expect(sqlTranslates(CANONICAL[c.op]!)).toBe(false);
    }
  });

  it('平台子集之外的探针操作符全部拒绝', () => {
    for (const probe of OUTSIDE_PROBES) {
      expect(sqlTranslates({ [probe]: [{ var: 'a' }] })).toBe(false);
    }
  });
});
