/**
 * 权限条件翻译器 — 将 ABAC 行级条件 DSL 翻译为 Prisma RecordWhereInput。
 *
 * 条件 DSL 结构（与 FilterCondition 对齐，支持 AND/OR 嵌套）：
 *
 * ```ts
 * // 单条件
 * { field: 'owner_id', operator: 'eq', value: '${currentUser}' }
 *
 * // 嵌套条件组
 * {
 *   logic: 'AND',
 *   conditions: [
 *     { field: 'status', operator: 'eq', value: 'active' },
 *     { field: 'amount', operator: 'gt', value: 1000 },
 *   ],
 *   groups: [
 *     { logic: 'OR', conditions: [...] }
 *   ],
 * }
 * ```
 *
 * 支持动态变量替换：
 *   - `${currentUser}` → 当前用户 ID
 *   - 其他 ${var} → 从 variables 映射中取值
 */

import { Prisma } from '@apaas/db';

/** 单个条件项。 */
interface ConditionItem {
  field: string;
  operator: string;
  value?: unknown;
}

/** 条件表达式（递归嵌套）。 */
interface ConditionExpr {
  logic?: 'AND' | 'OR';
  conditions?: ConditionItem[];
  groups?: ConditionExpr[];
}

/** 动态变量映射（如 { currentUser: 'user_xxx' }）。 */
export type VariableMap = Record<string, string>;

/**
 * 将权限条件 DSL 翻译为 Prisma RecordWhereInput。
 *
 * @param condition 权限条件（unknown，通常是 ConditionExpr JSON）
 * @param variables 动态变量映射
 * @returns Prisma where 片段，null 表示无条件（放行所有行）
 */
export function translateCondition(
  condition: unknown,
  variables: VariableMap,
): Prisma.RecordWhereInput | null {
  if (!condition || typeof condition !== 'object') return null;
  const expr = condition as ConditionExpr;
  return translateExpr(expr, variables);
}

/**
 * 递归翻译条件表达式。
 */
function translateExpr(
  expr: ConditionExpr,
  variables: VariableMap,
): Prisma.RecordWhereInput | null {
  const parts: Prisma.RecordWhereInput[] = [];

  // 翻译扁平条件
  if (expr.conditions) {
    for (const item of expr.conditions) {
      const where = translateItem(item, variables);
      if (where) parts.push(where);
    }
  }

  // 翻译嵌套子条件组
  if (expr.groups) {
    for (const group of expr.groups) {
      const where = translateExpr(group, variables);
      if (where) parts.push(where);
    }
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] ?? null;

  // 按 logic 组合
  const logic = expr.logic ?? 'AND';
  if (logic === 'OR') {
    return { OR: parts };
  }
  return { AND: parts };
}

/**
 * 翻译单个条件项为 Prisma where 片段。
 * 复用与 RecordService.buildCondition 相同的 JSONB path 查询模式。
 */
function translateItem(
  item: ConditionItem,
  variables: VariableMap,
): Prisma.RecordWhereInput | null {
  if (!item.field) return null;
  const path = [item.field];
  const rawValue = item.value;
  const value = resolveValue(rawValue, variables);

  switch (item.operator) {
    case 'eq':
      return { data: { path, equals: value as Prisma.InputJsonValue } };

    case 'ne':
      return {
        NOT: { data: { path, equals: value as Prisma.InputJsonValue } },
      };

    case 'contains':
      return { data: { path, string_contains: String(value) } };

    case 'not_contains':
      return {
        NOT: { data: { path, string_contains: String(value) } },
      };

    case 'starts_with':
      return { data: { path, string_starts_with: String(value) } };

    case 'ends_with':
      return { data: { path, string_ends_with: String(value) } };

    case 'gt':
      return { data: { path, gt: value as Prisma.InputJsonValue } };

    case 'gte':
      return { data: { path, gte: value as Prisma.InputJsonValue } };

    case 'lt':
      return { data: { path, lt: value as Prisma.InputJsonValue } };

    case 'lte':
      return { data: { path, lte: value as Prisma.InputJsonValue } };

    case 'is_empty':
      return {
        OR: [
          { data: { path, equals: Prisma.DbNull } },
          { data: { path, equals: Prisma.JsonNull } },
        ],
      };

    case 'is_not_empty':
      return {
        NOT: {
          OR: [
            { data: { path, equals: Prisma.DbNull } },
            { data: { path, equals: Prisma.JsonNull } },
          ],
        },
      };

    case 'in': {
      const values = Array.isArray(value) ? value : [value];
      return {
        OR: values.map(
          (v) =>
            ({
              data: { path, equals: v as Prisma.InputJsonValue },
            }) as Prisma.RecordWhereInput,
        ),
      };
    }

    case 'not_in': {
      const values = Array.isArray(value) ? value : [value];
      return {
        AND: values.map(
          (v) =>
            ({
              NOT: { data: { path, equals: v as Prisma.InputJsonValue } },
            }) as Prisma.RecordWhereInput,
        ),
      };
    }

    default:
      return null;
  }
}

/**
 * 解析值中的动态变量（如 ${currentUser}）。
 * 非字符串值原样返回。
 */
function resolveValue(value: unknown, variables: VariableMap): unknown {
  if (typeof value !== 'string') return value;
  // 替换 ${var} 模式
  return value.replace(/\$\{(\w+)\}/g, (_, name: string) =>
    variables[name] ?? '',
  );
}
