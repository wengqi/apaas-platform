import { describe, it, expect } from 'vitest';
import { translateCondition, type VariableMap } from './condition-translator.js';
import { Prisma } from '@apaas/db';

describe('condition-translator', () => {
  const variables: VariableMap = { currentUser: 'user_123' };

  describe('translateCondition — 基础', () => {
    it('空条件返回 null（放行所有行）', () => {
      expect(translateCondition(null, variables)).toBeNull();
      expect(translateCondition(undefined, variables)).toBeNull();
      expect(translateCondition('not-an-object', variables)).toBeNull();
    });

    it('空对象返回 null', () => {
      expect(translateCondition({}, variables)).toBeNull();
    });
  });

  describe('translateCondition — 各操作符', () => {
    it('== 等于', () => {
      expect(translateCondition({ '==': [{ var: 'status' }, 'active'] }, variables)).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('!= 不等于', () => {
      expect(translateCondition({ '!=': [{ var: 'status' }, 'inactive'] }, variables)).toEqual({
        NOT: { data: { path: ['status'], equals: 'inactive' } },
      });
    });

    it('字符串包含 — {"in": ["needle", {"var":"field"}]}', () => {
      expect(translateCondition({ in: ['john', { var: 'name' }] }, variables)).toEqual({
        data: { path: ['name'], string_contains: 'john' },
      });
    });

    it('不包含 — {"!": {"in": ["spam", {"var":"field"}]}}', () => {
      expect(translateCondition({ '!': { in: ['spam', { var: 'name' }] } }, variables)).toEqual({
        NOT: { data: { path: ['name'], string_contains: 'spam' } },
      });
    });

    it('属于集合 — {"in": [{"var":"field"}, [...] ]}', () => {
      expect(
        translateCondition({ in: [{ var: 'status' }, ['active', 'pending']] }, variables),
      ).toEqual({
        OR: [
          { data: { path: ['status'], equals: 'active' } },
          { data: { path: ['status'], equals: 'pending' } },
        ],
      });
    });

    it('不属于集合 — {"!": {"in": [{"var":"field"}, [...]]}}', () => {
      expect(
        translateCondition(
          { '!': { in: [{ var: 'status' }, ['deleted', 'archived']] } },
          variables,
        ),
      ).toEqual({
        NOT: {
          OR: [
            { data: { path: ['status'], equals: 'deleted' } },
            { data: { path: ['status'], equals: 'archived' } },
          ],
        },
      });
    });

    it('> 大于', () => {
      expect(translateCondition({ '>': [{ var: 'amount' }, 1000] }, variables)).toEqual({
        data: { path: ['amount'], gt: 1000 },
      });
    });

    it('>= 大于等于', () => {
      expect(translateCondition({ '>=': [{ var: 'amount' }, 1000] }, variables)).toEqual({
        data: { path: ['amount'], gte: 1000 },
      });
    });

    it('< 小于', () => {
      expect(translateCondition({ '<': [{ var: 'amount' }, 500] }, variables)).toEqual({
        data: { path: ['amount'], lt: 500 },
      });
    });

    it('<= 小于等于', () => {
      expect(translateCondition({ '<=': [{ var: 'amount' }, 500] }, variables)).toEqual({
        data: { path: ['amount'], lte: 500 },
      });
    });

    it('为空 — {"!": {"var":"field"}}', () => {
      expect(translateCondition({ '!': { var: 'note' } }, variables)).toEqual({
        OR: [
          { data: { path: ['note'], equals: Prisma.DbNull } },
          { data: { path: ['note'], equals: Prisma.JsonNull } },
        ],
      });
    });

    it('不为空 — {"!!": {"var":"field"}}', () => {
      expect(translateCondition({ '!!': { var: 'note' } }, variables)).toEqual({
        NOT: {
          OR: [
            { data: { path: ['note'], equals: Prisma.DbNull } },
            { data: { path: ['note'], equals: Prisma.JsonNull } },
          ],
        },
      });
    });
  });

  describe('translateCondition — 变量替换', () => {
    it('{"var":"__currentUser"} 从 variables 取值', () => {
      expect(
        translateCondition({ '==': [{ var: 'owner_id' }, { var: '__currentUser' }] }, variables),
      ).toEqual({
        data: { path: ['owner_id'], equals: 'user_123' },
      });
    });

    it('未定义的变量替换为 null', () => {
      expect(
        translateCondition({ '==': [{ var: 'owner_id' }, { var: '__unknownVar' }] }, variables),
      ).toEqual({
        data: { path: ['owner_id'], equals: null },
      });
    });
  });

  describe('translateCondition — 逻辑组合', () => {
    it('AND 逻辑', () => {
      expect(
        translateCondition(
          {
            and: [{ '==': [{ var: 'status' }, 'active'] }, { '>': [{ var: 'amount' }, 100] }],
          },
          variables,
        ),
      ).toEqual({
        AND: [
          { data: { path: ['status'], equals: 'active' } },
          { data: { path: ['amount'], gt: 100 } },
        ],
      });
    });

    it('OR 逻辑', () => {
      expect(
        translateCondition(
          {
            or: [{ '==': [{ var: 'status' }, 'urgent'] }, { '==': [{ var: 'priority' }, 'high'] }],
          },
          variables,
        ),
      ).toEqual({
        OR: [
          { data: { path: ['status'], equals: 'urgent' } },
          { data: { path: ['priority'], equals: 'high' } },
        ],
      });
    });

    it('单条件不包装 AND/OR', () => {
      expect(translateCondition({ '==': [{ var: 'status' }, 'active'] }, variables)).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('嵌套 (A AND (B OR C))', () => {
      expect(
        translateCondition(
          {
            and: [
              { '==': [{ var: 'a' }, 1] },
              {
                or: [{ '==': [{ var: 'b' }, 2] }, { '==': [{ var: 'c' }, 3] }],
              },
            ],
          },
          variables,
        ),
      ).toEqual({
        AND: [
          { data: { path: ['a'], equals: 1 } },
          {
            OR: [{ data: { path: ['b'], equals: 2 } }, { data: { path: ['c'], equals: 3 } }],
          },
        ],
      });
    });
  });
});
