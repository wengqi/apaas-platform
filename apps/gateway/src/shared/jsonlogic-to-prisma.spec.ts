import { describe, it, expect } from 'vitest';
import {
  jsonLogicToPrismaWhere,
  UntranslatableConditionError,
  type VariableMap,
} from './jsonlogic-to-prisma.js';
import { Prisma } from '@apaas/db';

describe('jsonlogic-to-prisma', () => {
  const variables: VariableMap = { currentUser: 'user_123' };

  // -------------------------------------------------------------------------
  // 空规则
  // -------------------------------------------------------------------------

  describe('空规则', () => {
    it('null / undefined / 非对象 → null（放行所有行）', () => {
      expect(jsonLogicToPrismaWhere(null, variables)).toBeNull();
      expect(jsonLogicToPrismaWhere(undefined, variables)).toBeNull();
      expect(jsonLogicToPrismaWhere('not-an-object', variables)).toBeNull();
    });

    it('空对象 → null', () => {
      expect(jsonLogicToPrismaWhere({}, variables)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 比较操作符
  // -------------------------------------------------------------------------

  describe('比较操作符', () => {
    it('== 等于', () => {
      expect(jsonLogicToPrismaWhere({ '==': [{ var: 'status' }, 'active'] }, variables)).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('!= 不等于', () => {
      expect(jsonLogicToPrismaWhere({ '!=': [{ var: 'status' }, 'inactive'] }, variables)).toEqual({
        NOT: { data: { path: ['status'], equals: 'inactive' } },
      });
    });

    it('> 大于', () => {
      expect(jsonLogicToPrismaWhere({ '>': [{ var: 'amount' }, 1000] }, variables)).toEqual({
        data: { path: ['amount'], gt: 1000 },
      });
    });

    it('>= 大于等于', () => {
      expect(jsonLogicToPrismaWhere({ '>=': [{ var: 'amount' }, 1000] }, variables)).toEqual({
        data: { path: ['amount'], gte: 1000 },
      });
    });

    it('< 小于', () => {
      expect(jsonLogicToPrismaWhere({ '<': [{ var: 'amount' }, 500] }, variables)).toEqual({
        data: { path: ['amount'], lt: 500 },
      });
    });

    it('<= 小于等于', () => {
      expect(jsonLogicToPrismaWhere({ '<=': [{ var: 'amount' }, 500] }, variables)).toEqual({
        data: { path: ['amount'], lte: 500 },
      });
    });
  });

  // -------------------------------------------------------------------------
  // in 操作符（两种语义）
  // -------------------------------------------------------------------------

  describe('in 操作符', () => {
    it('字符串包含 — {"in": ["needle", {"var":"field"}]}', () => {
      expect(jsonLogicToPrismaWhere({ in: ['john', { var: 'name' }] }, variables)).toEqual({
        data: { path: ['name'], string_contains: 'john' },
      });
    });

    it('属于集合 — {"in": [{"var":"field"}, ["v1","v2"]]}', () => {
      expect(
        jsonLogicToPrismaWhere({ in: [{ var: 'status' }, ['active', 'pending']] }, variables),
      ).toEqual({
        OR: [
          { data: { path: ['status'], equals: 'active' } },
          { data: { path: ['status'], equals: 'pending' } },
        ],
      });
    });

    it('属于集合 — 单元素数组', () => {
      expect(jsonLogicToPrismaWhere({ in: [{ var: 'status' }, ['active']] }, variables)).toEqual({
        OR: [{ data: { path: ['status'], equals: 'active' } }],
      });
    });
  });

  // -------------------------------------------------------------------------
  // NOT 操作符
  // -------------------------------------------------------------------------

  describe('NOT 操作符', () => {
    it('{"!": {"==": [...]}} → NOT equals', () => {
      expect(
        jsonLogicToPrismaWhere({ '!': { '==': [{ var: 'status' }, 'inactive'] } }, variables),
      ).toEqual({
        NOT: { data: { path: ['status'], equals: 'inactive' } },
      });
    });

    it('{"!": {"in": ["spam", {"var":"name"}]}} → NOT string_contains（不包含）', () => {
      expect(jsonLogicToPrismaWhere({ '!': { in: ['spam', { var: 'name' }] } }, variables)).toEqual(
        {
          NOT: { data: { path: ['name'], string_contains: 'spam' } },
        },
      );
    });

    it('{"!": {"in": [{"var":"status"}, ["deleted","archived"]]}} → NOT IN', () => {
      expect(
        jsonLogicToPrismaWhere(
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
  });

  // -------------------------------------------------------------------------
  // 空 / 非空检测
  // -------------------------------------------------------------------------

  describe('空 / 非空检测', () => {
    it('{"!": {"var":"field"}} → 为空', () => {
      expect(jsonLogicToPrismaWhere({ '!': { var: 'note' } }, variables)).toEqual({
        OR: [
          { data: { path: ['note'], equals: Prisma.DbNull } },
          { data: { path: ['note'], equals: Prisma.JsonNull } },
        ],
      });
    });

    it('{"!!": {"var":"field"}} → 不为空', () => {
      expect(jsonLogicToPrismaWhere({ '!!': { var: 'note' } }, variables)).toEqual({
        NOT: {
          OR: [
            { data: { path: ['note'], equals: Prisma.DbNull } },
            { data: { path: ['note'], equals: Prisma.JsonNull } },
          ],
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 逻辑组合
  // -------------------------------------------------------------------------

  describe('逻辑组合', () => {
    it('AND 组合', () => {
      expect(
        jsonLogicToPrismaWhere(
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

    it('OR 组合', () => {
      expect(
        jsonLogicToPrismaWhere(
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

    it('单元素 AND 不额外包装', () => {
      expect(
        jsonLogicToPrismaWhere({ and: [{ '==': [{ var: 'status' }, 'active'] }] }, variables),
      ).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('嵌套 (A AND (B OR C))', () => {
      expect(
        jsonLogicToPrismaWhere(
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

    it('深层嵌套 NOT + AND + OR', () => {
      expect(
        jsonLogicToPrismaWhere(
          {
            or: [
              { '!': { '==': [{ var: 'status' }, 'closed'] } },
              {
                and: [{ '>': [{ var: 'amount' }, 500] }, { '!!': { var: 'note' } }],
              },
            ],
          },
          variables,
        ),
      ).toEqual({
        OR: [
          { NOT: { data: { path: ['status'], equals: 'closed' } } },
          {
            AND: [
              { data: { path: ['amount'], gt: 500 } },
              {
                NOT: {
                  OR: [
                    { data: { path: ['note'], equals: Prisma.DbNull } },
                    { data: { path: ['note'], equals: Prisma.JsonNull } },
                  ],
                },
              },
            ],
          },
        ],
      });
    });
  });

  // -------------------------------------------------------------------------
  // 变量替换
  // -------------------------------------------------------------------------

  describe('变量替换', () => {
    it('{"var":"__currentUser"} 从 variables 取值', () => {
      expect(
        jsonLogicToPrismaWhere(
          { '==': [{ var: 'owner_id' }, { var: '__currentUser' }] },
          variables,
        ),
      ).toEqual({
        data: { path: ['owner_id'], equals: 'user_123' },
      });
    });

    it('未定义的变量替换为 null', () => {
      expect(
        jsonLogicToPrismaWhere({ '==': [{ var: 'owner_id' }, { var: '__unknownVar' }] }, variables),
      ).toEqual({
        data: { path: ['owner_id'], equals: null },
      });
    });

    it('无 variables 映射时变量替换为 null', () => {
      expect(
        jsonLogicToPrismaWhere({ '==': [{ var: 'owner_id' }, { var: '__currentUser' }] }),
      ).toEqual({
        data: { path: ['owner_id'], equals: null },
      });
    });
  });

  // -------------------------------------------------------------------------
  // 边界情况
  // -------------------------------------------------------------------------

  describe('边界情况', () => {
    it('and 值为单对象（非数组）也能处理', () => {
      expect(
        jsonLogicToPrismaWhere({ and: { '==': [{ var: 'status' }, 'active'] } }, variables),
      ).toEqual({
        data: { path: ['status'], equals: 'active' },
      });
    });

    it('未知操作符返回 null', () => {
      expect(jsonLogicToPrismaWhere({ unknownOp: [{ var: 'x' }, 1] }, variables)).toBeNull();
    });

    it('比较操作符参数不足返回 null', () => {
      expect(jsonLogicToPrismaWhere({ '==': [{ var: 'x' }] }, variables)).toBeNull();
    });

    it('比较操作符左侧非字段引用返回 null', () => {
      expect(jsonLogicToPrismaWhere({ '==': ['literal', 'value'] }, variables)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // relative_date 操作符
  // -------------------------------------------------------------------------

  describe('relative_date 操作符', () => {
    it('today 预设 → AND(gte start, lt end)', () => {
      const result = jsonLogicToPrismaWhere(
        { relative_date: [{ var: 'createdAt' }, 'today'] },
        variables,
      );
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('AND');
      const andArr = (result as { AND: unknown[] }).AND;
      expect(andArr).toHaveLength(2);
      expect(andArr[0]).toEqual({
        data: { path: ['createdAt'], gte: expect.any(String) },
      });
      expect(andArr[1]).toEqual({
        data: { path: ['createdAt'], lt: expect.any(String) },
      });
    });

    it('this_month 预设 → AND(gte start, lt end)', () => {
      const result = jsonLogicToPrismaWhere(
        { relative_date: [{ var: 'createdAt' }, 'this_month'] },
        variables,
      );
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('AND');
    });

    it('未知预设返回 null', () => {
      expect(
        jsonLogicToPrismaWhere(
          { relative_date: [{ var: 'createdAt' }, 'unknown_preset'] },
          variables,
        ),
      ).toBeNull();
    });

    it('左侧非字段引用返回 null', () => {
      expect(jsonLogicToPrismaWhere({ relative_date: ['literal', 'today'] }, variables)).toBeNull();
    });

    it('参数不足返回 null', () => {
      expect(
        jsonLogicToPrismaWhere({ relative_date: [{ var: 'createdAt' }] }, variables),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // strict 模式（fail-closed — 权限条件专用，B5 修复）
  // -------------------------------------------------------------------------

  it('strict: 不支持的操作符抛出 UntranslatableConditionError', () => {
    expect(() =>
      jsonLogicToPrismaWhere({ startsWith: [{ var: 'name' }, 'A'] }, variables, { strict: true }),
    ).toThrow(UntranslatableConditionError);
  });

  it('strict: and 分支含不可翻译子条件时抛错（防止丢弃分支削弱限制）', () => {
    expect(() =>
      jsonLogicToPrismaWhere(
        {
          and: [
            { '==': [{ var: 'owner' }, { var: '__currentUser' }] },
            { unsupported_op: [{ var: 'x' }, 1] },
          ],
        },
        variables,
        { strict: true },
      ),
    ).toThrow(UntranslatableConditionError);
  });

  it('strict: 规则不是对象时抛错', () => {
    expect(() =>
      jsonLogicToPrismaWhere('not an object' as unknown, variables, { strict: true }),
    ).toThrow(UntranslatableConditionError);
  });

  it('strict: 空对象条件抛错（恒真语义在权限场景禁止）', () => {
    expect(() => jsonLogicToPrismaWhere({}, variables, { strict: true })).toThrow(
      UntranslatableConditionError,
    );
  });

  it('strict: null/undefined 规则仍返回 null（表示无限制的规则配置）', () => {
    expect(jsonLogicToPrismaWhere(null, variables, { strict: true })).toBeNull();
    expect(jsonLogicToPrismaWhere(undefined, variables, { strict: true })).toBeNull();
  });

  it('strict: 合法条件正常翻译不抛错', () => {
    const where = jsonLogicToPrismaWhere(
      { '==': [{ var: 'owner' }, { var: '__currentUser' }] },
      variables,
      { strict: true },
    );
    expect(where).toEqual({
      data: { path: ['owner'], equals: 'user_123' },
    });
  });

  it('宽松模式（默认）行为不变：不支持的操作符返回 null', () => {
    expect(jsonLogicToPrismaWhere({ startsWith: [{ var: 'name' }, 'A'] }, variables)).toBeNull();
  });
});
