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

    it('无 conditions 和 groups 返回 null', () => {
      expect(translateCondition({}, variables)).toBeNull();
    });
  });

  describe('translateCondition — 各 operator', () => {
    it('eq — 等于', () => {
      const result = translateCondition(
        { conditions: [{ field: 'status', operator: 'eq', value: 'active' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('ne — 不等于', () => {
      const result = translateCondition(
        { conditions: [{ field: 'status', operator: 'ne', value: 'inactive' }] },
        variables,
      );
      expect(result).toEqual({
        NOT: { data: { path: ['status'], equals: 'inactive' } },
      });
    });

    it('contains — 包含', () => {
      const result = translateCondition(
        { conditions: [{ field: 'name', operator: 'contains', value: 'john' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['name'], string_contains: 'john' },
      });
    });

    it('not_contains — 不包含', () => {
      const result = translateCondition(
        { conditions: [{ field: 'name', operator: 'not_contains', value: 'spam' }] },
        variables,
      );
      expect(result).toEqual({
        NOT: { data: { path: ['name'], string_contains: 'spam' } },
      });
    });

    it('starts_with — 前缀匹配', () => {
      const result = translateCondition(
        { conditions: [{ field: 'code', operator: 'starts_with', value: 'PRE' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['code'], string_starts_with: 'PRE' },
      });
    });

    it('ends_with — 后缀匹配', () => {
      const result = translateCondition(
        { conditions: [{ field: 'email', operator: 'ends_with', value: '@test.com' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['email'], string_ends_with: '@test.com' },
      });
    });

    it('gt — 大于', () => {
      const result = translateCondition(
        { conditions: [{ field: 'amount', operator: 'gt', value: 1000 }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['amount'], gt: 1000 },
      });
    });

    it('gte — 大于等于', () => {
      const result = translateCondition(
        { conditions: [{ field: 'amount', operator: 'gte', value: 1000 }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['amount'], gte: 1000 },
      });
    });

    it('lt — 小于', () => {
      const result = translateCondition(
        { conditions: [{ field: 'amount', operator: 'lt', value: 500 }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['amount'], lt: 500 },
      });
    });

    it('lte — 小于等于', () => {
      const result = translateCondition(
        { conditions: [{ field: 'amount', operator: 'lte', value: 500 }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['amount'], lte: 500 },
      });
    });

    it('is_empty — 使用 Prisma.DbNull / JsonNull 哨兵', () => {
      const result = translateCondition(
        { conditions: [{ field: 'note', operator: 'is_empty' }] },
        variables,
      );
      expect(result).toEqual({
        OR: [
          { data: { path: ['note'], equals: Prisma.DbNull } },
          { data: { path: ['note'], equals: Prisma.JsonNull } },
        ],
      });
    });

    it('is_not_empty — NOT 取反', () => {
      const result = translateCondition(
        { conditions: [{ field: 'note', operator: 'is_not_empty' }] },
        variables,
      );
      expect(result).toEqual({
        NOT: {
          OR: [
            { data: { path: ['note'], equals: Prisma.DbNull } },
            { data: { path: ['note'], equals: Prisma.JsonNull } },
          ],
        },
      });
    });

    it('in — 展开为 OR 多个 equals', () => {
      const result = translateCondition(
        { conditions: [{ field: 'status', operator: 'in', value: ['active', 'pending'] }] },
        variables,
      );
      expect(result).toEqual({
        OR: [
          { data: { path: ['status'], equals: 'active' } },
          { data: { path: ['status'], equals: 'pending' } },
        ],
      });
    });

    it('not_in — 展开为 AND 多个 NOT equals', () => {
      const result = translateCondition(
        { conditions: [{ field: 'status', operator: 'not_in', value: ['deleted', 'archived'] }] },
        variables,
      );
      expect(result).toEqual({
        AND: [
          { NOT: { data: { path: ['status'], equals: 'deleted' } } },
          { NOT: { data: { path: ['status'], equals: 'archived' } } },
        ],
      });
    });

    it('未知 operator 返回 null', () => {
      const result = translateCondition(
        { conditions: [{ field: 'x', operator: 'unknown_op', value: 1 }] },
        variables,
      );
      expect(result).toBeNull();
    });
  });

  describe('translateCondition — 变量替换', () => {
    it('${currentUser} 变量被替换', () => {
      const result = translateCondition(
        { conditions: [{ field: 'owner_id', operator: 'eq', value: '${currentUser}' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['owner_id'], equals: 'user_123' },
      });
    });

    it('未定义的变量替换为空串', () => {
      const result = translateCondition(
        { conditions: [{ field: 'x', operator: 'eq', value: '${unknownVar}' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['x'], equals: '' },
      });
    });
  });

  describe('translateCondition — 逻辑组合', () => {
    it('AND 逻辑（默认）', () => {
      const result = translateCondition(
        {
          logic: 'AND',
          conditions: [
            { field: 'status', operator: 'eq', value: 'active' },
            { field: 'amount', operator: 'gt', value: 100 },
          ],
        },
        variables,
      );
      expect(result).toEqual({
        AND: [
          { data: { path: ['status'], equals: 'active' } },
          { data: { path: ['amount'], gt: 100 } },
        ],
      });
    });

    it('OR 逻辑', () => {
      const result = translateCondition(
        {
          logic: 'OR',
          conditions: [
            { field: 'status', operator: 'eq', value: 'urgent' },
            { field: 'priority', operator: 'eq', value: 'high' },
          ],
        },
        variables,
      );
      expect(result).toEqual({
        OR: [
          { data: { path: ['status'], equals: 'urgent' } },
          { data: { path: ['priority'], equals: 'high' } },
        ],
      });
    });

    it('单条件不包装 AND/OR', () => {
      const result = translateCondition(
        { conditions: [{ field: 'status', operator: 'eq', value: 'active' }] },
        variables,
      );
      expect(result).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('嵌套 groups 递归翻译', () => {
      const result = translateCondition(
        {
          logic: 'AND',
          conditions: [{ field: 'a', operator: 'eq', value: 1 }],
          groups: [
            {
              logic: 'OR',
              conditions: [
                { field: 'b', operator: 'eq', value: 2 },
                { field: 'c', operator: 'eq', value: 3 },
              ],
            },
          ],
        },
        variables,
      );
      expect(result).toEqual({
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
