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

/** 翻译选项。 */
export interface TranslateOptions {
  /**
   * 严格模式（fail-closed）：任何无法翻译的节点抛出 UntranslatableConditionError，
   * 而非静默返回 null（= 无条件放行全部行）。
   * 权限条件（ABAC）必须开启 — 静默放行会将"仅本人记录"类规则放大为全表访问。
   */
  strict?: boolean;
}

/** 权限条件包含无法翻译的操作符（strict 模式抛出）。 */
export class UntranslatableConditionError extends Error {
  constructor(detail: string) {
    super(`权限条件无法翻译（fail-closed 拒绝执行）: ${detail}`);
    this.name = 'UntranslatableConditionError';
  }
}

/**
 * 将 JsonLogic 规则翻译为 Prisma RecordWhereInput。
 *
 * @param rule JsonLogic JSON 规则
 * @param variables 动态变量映射（如当前用户 ID）
 * @param options strict=true 时不可翻译节点抛错（权限条件必须开启）
 * @returns Prisma where 片段，null 表示无条件（放行所有行）
 */
export function jsonLogicToPrismaWhere(
  rule: unknown,
  variables?: VariableMap,
  options?: TranslateOptions,
): Prisma.RecordWhereInput | null {
  const strict = options?.strict ?? false;
  if (rule === null || rule === undefined) return null;
  if (typeof rule !== 'object') {
    if (strict) throw new UntranslatableConditionError(`规则不是对象: ${typeof rule}`);
    return null;
  }
  return translateNode(rule, variables, strict);
}

/**
 * strict 模式下的失败处理：抛错或返回 null（宽松模式静默忽略）。
 */
function untranslatable(detail: string, strict: boolean): null {
  if (strict) throw new UntranslatableConditionError(detail);
  return null;
}

/**
 * 递归翻译 JsonLogic 节点。
 */
function translateNode(
  node: unknown,
  variables: VariableMap | undefined,
  strict: boolean,
): Prisma.RecordWhereInput | null {
  if (!node || typeof node !== 'object') {
    return untranslatable(`节点不是对象: ${typeof node}`, strict);
  }

  const entries = Object.entries(node);
  if (entries.length === 0) {
    return untranslatable('空条件节点 {}（语义为恒真，权限场景禁止）', strict);
  }

  const firstEntry = entries[0];
  if (!firstEntry) return null;
  const [op, value] = firstEntry;

  switch (op) {
    case 'and': {
      const arr = toArray(value);
      const parts = arr.map((v) => translateNode(v, variables, strict));
      if (strict && parts.some((p) => p === null)) {
        // 丢弃分支会削弱限制（and 中丢失子条件 = 放宽），strict 下禁止
        return untranslatable(`and 分支中包含不可翻译子条件: ${JSON.stringify(value)}`, strict);
      }
      const filtered = parts.filter((p): p is Prisma.RecordWhereInput => p !== null);
      if (filtered.length === 0) return null;
      if (filtered.length === 1) return filtered[0] ?? null;
      return { AND: filtered };
    }

    case 'or': {
      const arr = toArray(value);
      const parts = arr.map((v) => translateNode(v, variables, strict));
      if (strict && parts.some((p) => p === null)) {
        return untranslatable(`or 分支中包含不可翻译子条件: ${JSON.stringify(value)}`, strict);
      }
      const filtered = parts.filter((p): p is Prisma.RecordWhereInput => p !== null);
      if (filtered.length === 0) return null;
      if (filtered.length === 1) return filtered[0] ?? null;
      return { OR: filtered };
    }

    case '!': {
      // {"!": {...}} → NOT
      // {"!": {"var":"field"}} → 为空检测（特殊处理）
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const innerEntries = Object.entries(value);
        if (innerEntries.length === 1 && innerEntries[0]?.[0] === 'var') {
          return isEmptyCheck(innerEntries[0][1]);
        }
        const inner = translateNode(value, variables, strict);
        if (!inner) {
          return untranslatable(`! 操作数不可翻译: ${JSON.stringify(value)}`, strict);
        }
        return { NOT: inner };
      }
      return untranslatable(`! 操作数非法: ${JSON.stringify(value)}`, strict);
    }

    case '!!': {
      // {"!!": {"var":"field"}} → 不为空检测
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const innerEntries = Object.entries(value);
        if (innerEntries.length === 1 && innerEntries[0]?.[0] === 'var') {
          return isNotEmptyCheck(innerEntries[0][1]);
        }
      }
      return untranslatable(`!! 操作数非法: ${JSON.stringify(value)}`, strict);
    }

    case '>':
    case '>=':
    case '<':
    case '<=':
    case '==':
    case '!=':
      return translateComparison(op, value, variables, strict);

    case 'in':
      return translateIn(value, variables, strict);

    case 'relative_date':
      return translateRelativeDate(value, variables, strict);

    default:
      return untranslatable(`不支持的操作符 "${op}"`, strict);
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
  variables: VariableMap | undefined,
  strict: boolean,
): Prisma.RecordWhereInput | null {
  const args = toArray(value);
  if (args.length < 2) {
    return untranslatable(`${op} 操作数数量不足`, strict);
  }

  const fieldArg = args[0];
  const valArg = args[1];

  const fieldName = extractVarName(fieldArg);
  if (!fieldName) {
    return untranslatable(`${op} 左侧不是字段引用: ${JSON.stringify(fieldArg)}`, strict);
  }

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
function translateIn(
  value: unknown,
  variables: VariableMap | undefined,
  strict: boolean,
): Prisma.RecordWhereInput | null {
  const args = toArray(value);
  if (args.length < 2) return untranslatable('in 操作数数量不足', strict);

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
// relative_date 操作符（相对日期范围过滤）
// ---------------------------------------------------------------------------

/**
 * 翻译 relative_date 操作符：{"relative_date": [{"var":"field"}, "today"]}
 *
 * 将预设（today/yesterday/last_7_days 等）解析为日期区间 [start, end)，
 * 翻译为 Prisma JSONB path 范围过滤（gte start AND lt end）。
 */
function translateRelativeDate(
  value: unknown,
  _variables: VariableMap | undefined,
  strict: boolean,
): Prisma.RecordWhereInput | null {
  const args = toArray(value);
  if (args.length < 2) return untranslatable('relative_date 操作数数量不足', strict);

  const fieldArg = args[0];
  const presetArg = args[1];

  const fieldName = extractVarName(fieldArg);
  if (!fieldName) {
    return untranslatable('relative_date 左侧不是字段引用', strict);
  }

  const preset = typeof presetArg === 'string' ? presetArg : '';
  const range = computePrismaDateRange(preset);
  if (!range) return untranslatable(`未知日期预设: ${preset}`, strict);

  const [start, end] = range;
  const path = [fieldName];

  return {
    AND: [
      { data: { path, gte: start as Prisma.InputJsonValue } },
      { data: { path, lt: end as Prisma.InputJsonValue } },
    ],
  };
}

/**
 * 计算相对日期范围的 [start, end) ISO 字符串。
 * 与 process-utils.ts 中的 computeRelativeDateRange 逻辑保持一致。
 */
function computePrismaDateRange(preset: string): [string, string] | null {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const ranges: Record<string, () => [string, string]> = {
    today: () => [startOfDay.toISOString(), endOfDay.toISOString()],
    yesterday: () => {
      const s = new Date(startOfDay);
      s.setDate(s.getDate() - 1);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      return [s.toISOString(), e.toISOString()];
    },
    last_7_days: () => {
      const s = new Date(startOfDay);
      s.setDate(s.getDate() - 6);
      return [s.toISOString(), endOfDay.toISOString()];
    },
    last_30_days: () => {
      const s = new Date(startOfDay);
      s.setDate(s.getDate() - 29);
      return [s.toISOString(), endOfDay.toISOString()];
    },
    this_week: () => {
      const day = startOfDay.getDay() || 7;
      const s = new Date(startOfDay);
      s.setDate(s.getDate() - day + 1);
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
      return [s.toISOString(), e.toISOString()];
    },
    this_month: () => {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return [s.toISOString(), e.toISOString()];
    },
    this_quarter: () => {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), q * 3, 1);
      const e = new Date(now.getFullYear(), q * 3 + 3, 1);
      return [s.toISOString(), e.toISOString()];
    },
    this_year: () => {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear() + 1, 0, 1);
      return [s.toISOString(), e.toISOString()];
    },
  };

  const fn = ranges[preset];
  return fn ? fn() : null;
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
