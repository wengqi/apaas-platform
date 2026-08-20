/**
 * JsonLogic → Prisma RecordWhereInput 翻译器。
 *
 * 将 JsonLogic JSON 规则翻译为 Prisma JSONB path 过滤条件，
 * 供视图筛选、行级 ABAC 权限、API 查询 filter 共用。
 *
 * JsonLogic 格式示例：
 *   {"and": [{">": [{"var":"amount"}, 1000]}, {"==": [{"var":"status"}, "active"]}]}
 *   {"in": ["substr", {"var":"name"}]}            — 字符串包含
 *   {"in": [{"var":"status"}, ["open","pending"]]} — 属于集合
 *   {"!": {"var":"field"}}                         — 为空
 *
 * 变量替换：{"var":"__currentUser"} 从 variables 映射取值。
 */

import { Prisma } from '@apaas/db';

/** 动态变量映射（如 { currentUser: 'user_xxx' }）。 */
export type VariableMap = Record<string, string>;

/**
 * 将 JsonLogic 规则翻译为 Prisma RecordWhereInput。
 *
 * @param rule JsonLogic JSON 规则
 * @param variables 动态变量映射（如当前用户 ID）
 * @returns Prisma where 片段，null 表示无条件（放行所有行）
 */
export function jsonLogicToPrismaWhere(
  rule: unknown,
  variables?: VariableMap,
): Prisma.RecordWhereInput | null {
  if (!rule || typeof rule !== 'object') return null;
  const result = translateNode(rule, variables);
  return result;
}

/**
 * 递归翻译 JsonLogic 节点。
 */
function translateNode(node: unknown, variables?: VariableMap): Prisma.RecordWhereInput | null {
  if (!node || typeof node !== 'object') return null;

  const entries = Object.entries(node);
  if (entries.length === 0) return null;

  const firstEntry = entries[0];
  if (!firstEntry) return null;
  const [op, value] = firstEntry;

  switch (op) {
    case 'and': {
      const arr = toArray(value);
      const parts = arr
        .map((v) => translateNode(v, variables))
        .filter((p): p is Prisma.RecordWhereInput => p !== null);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0] ?? null;
      return { AND: parts };
    }

    case 'or': {
      const arr = toArray(value);
      const parts = arr
        .map((v) => translateNode(v, variables))
        .filter((p): p is Prisma.RecordWhereInput => p !== null);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0] ?? null;
      return { OR: parts };
    }

    case '!': {
      // {"!": {...}} → NOT
      // {"!": {"var":"field"}} → 为空检测（特殊处理）
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const innerEntries = Object.entries(value);
        if (innerEntries.length === 1 && innerEntries[0]?.[0] === 'var') {
          return isEmptyCheck(innerEntries[0][1]);
        }
        const inner = translateNode(value, variables);
        if (!inner) return null;
        return { NOT: inner };
      }
      return null;
    }

    case '!!': {
      // {"!!": {"var":"field"}} → 不为空检测
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const innerEntries = Object.entries(value);
        if (innerEntries.length === 1 && innerEntries[0]?.[0] === 'var') {
          return isNotEmptyCheck(innerEntries[0][1]);
        }
      }
      return null;
    }

    case '>':
    case '>=':
    case '<':
    case '<=':
    case '==':
    case '!=':
      return translateComparison(op, value, variables);

    case 'in':
      return translateIn(value, variables);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 比较操作符
// ---------------------------------------------------------------------------

/**
 * 翻译比较操作符：{">": [{"var":"field"}, value]}
 */
function translateComparison(
  op: string,
  value: unknown,
  variables?: VariableMap,
): Prisma.RecordWhereInput | null {
  const args = toArray(value);
  if (args.length < 2) return null;

  const fieldArg = args[0];
  const valArg = args[1];

  const fieldName = extractVarName(fieldArg);
  if (!fieldName) return null;

  const resolvedValue = resolveValue(valArg, variables);
  const path = [fieldName];

  switch (op) {
    case '==':
      return { data: { path, equals: resolvedValue as Prisma.InputJsonValue } };

    case '!=':
      return {
        NOT: { data: { path, equals: resolvedValue as Prisma.InputJsonValue } },
      };

    case '>':
      return { data: { path, gt: resolvedValue as Prisma.InputJsonValue } };

    case '>=':
      return { data: { path, gte: resolvedValue as Prisma.InputJsonValue } };

    case '<':
      return { data: { path, lt: resolvedValue as Prisma.InputJsonValue } };

    case '<=':
      return { data: { path, lte: resolvedValue as Prisma.InputJsonValue } };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// in 操作符（两种语义）
// ---------------------------------------------------------------------------

/**
 * 翻译 in 操作符。
 *
 * 两种语义根据第一个参数判断：
 * - {"in": ["needle", {"var":"field"}]}  → 字符串包含（string_contains）
 * - {"in": [{"var":"field"}, [v1,v2]]}   → 属于集合（IN）
 */
function translateIn(value: unknown, variables?: VariableMap): Prisma.RecordWhereInput | null {
  const args = toArray(value);
  if (args.length < 2) return null;

  const first = args[0];
  const second = args[1];

  // 判断是 "属于集合" 还是 "字符串包含"
  const fieldFromFirst = extractVarName(first);
  const fieldFromSecond = extractVarName(second);

  if (fieldFromFirst) {
    // {"in": [{"var":"field"}, [v1,v2]]} — 属于集合
    const path = [fieldFromFirst];
    const values = Array.isArray(second) ? second : [second];
    return {
      OR: values.map(
        (v) =>
          ({
            data: { path, equals: resolveValue(v, variables) as Prisma.InputJsonValue },
          }) as Prisma.RecordWhereInput,
      ),
    };
  }

  if (fieldFromSecond) {
    // {"in": ["needle", {"var":"field"}]} — 字符串包含
    const path = [fieldFromSecond];
    const needle = resolveValue(first, variables);
    return { data: { path, string_contains: String(needle) } };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 空/非空检测
// ---------------------------------------------------------------------------

/**
 * {"!": {"var":"field"}} — 字段为空（null 或不存在）
 */
function isEmptyCheck(varName: unknown): Prisma.RecordWhereInput {
  const fieldName = typeof varName === 'string' ? varName : '';
  const path = [fieldName];
  return {
    OR: [{ data: { path, equals: Prisma.DbNull } }, { data: { path, equals: Prisma.JsonNull } }],
  };
}

/**
 * {"!!": {"var":"field"}} — 字段不为空
 */
function isNotEmptyCheck(varName: unknown): Prisma.RecordWhereInput {
  const fieldName = typeof varName === 'string' ? varName : '';
  const path = [fieldName];
  return {
    NOT: {
      OR: [{ data: { path, equals: Prisma.DbNull } }, { data: { path, equals: Prisma.JsonNull } }],
    },
  };
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 确保值是数组（JsonLogic 中 and/or 的值可能是单个对象而非数组）。
 */
function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * 从 {"var": "fieldName"} 提取字段名。
 * 变量名以双下划线开头（如 __currentUser）时从 variables 映射取值，返回 null（非字段）。
 *
 * @returns 字段名，或 null 如果不是字段引用
 */
function extractVarName(arg: unknown): string | null {
  if (!arg || typeof arg !== 'object' || Array.isArray(arg)) return null;
  const entries = Object.entries(arg);
  if (entries.length !== 1 || entries[0]?.[0] !== 'var') return null;
  const varName = entries[0][1];
  if (typeof varName !== 'string') return null;
  // 以 __ 开头的保留变量名不作为字段名
  if (varName.startsWith('__')) return null;
  return varName;
}

/**
 * 解析值：如果是变量引用 {"var":"__currentUser"} 则从 variables 取值，否则原样返回。
 */
function resolveValue(val: unknown, variables?: VariableMap): unknown {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
  const entries = Object.entries(val);
  if (entries.length === 1 && entries[0]?.[0] === 'var') {
    const varName = entries[0][1];
    if (typeof varName === 'string') {
      // __currentUser → currentUser
      const key = varName.startsWith('__') ? varName.slice(2) : varName;
      // 变量引用始终从 variables 映射取值；无映射或未定义时返回 null
      return variables?.[key] ?? null;
    }
  }
  return val;
}
