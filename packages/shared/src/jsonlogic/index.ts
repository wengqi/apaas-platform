/**
 * JsonLogic 可译子集 SSOT（ADR-0004 决策 7）。
 *
 * 平台有两个 JsonLogic 消费端：行级权限下推（jsonlogic-to-prisma，strict
 * fail-closed）与数据流下推（jsonlogic-to-sql，不可译返回 null 兜底）。两者
 * **实现不合并**（失败语义相反是设计使然），但"平台可译子集"只有一个事实源：
 * 本 module 声明每个操作符的语义、操作数契约与支持的翻译器。翻译器的 default
 * 拒绝信息与本锚定测试（jsonlogic-subset.anchor.spec）都消费这里——任何人给
 * 某个翻译器加/删操作符而不改本声明，锚定测试即红。
 */

/** JsonLogic 翻译器标识（与实现文件一一对应）。 */
export type JsonLogicTranslator = 'prisma' | 'sql';

/** 单个操作符的子集契约。 */
export interface JsonLogicOperatorContract {
  /** JsonLogic 操作符键。 */
  op: string;
  /** 语义说明（方言指南同源文案）。 */
  semantics: string;
  /** 操作数契约（形状约束，方言指南同源文案）。 */
  operands: string;
  /** 支持该操作符的翻译器。 */
  translators: JsonLogicTranslator[];
}

/** 平台 JsonLogic 可译子集（唯一事实源；按核心在前、扩展在后排序）。 */
export const JSONLOGIC_OPERATOR_CONTRACTS: readonly JsonLogicOperatorContract[] = [
  {
    op: 'var',
    semantics: '字段引用',
    operands: '{"var":"字段名"}；双下划线前缀为保留变量（如 __currentUser，取运行时映射）',
    translators: ['prisma', 'sql'],
  },
  {
    op: 'and',
    semantics: '且',
    operands: '操作数数组，每项为子规则；任一子项不可译则整体不可译',
    translators: ['prisma', 'sql'],
  },
  {
    op: 'or',
    semantics: '或',
    operands: '操作数数组，每项为子规则；任一子项不可译则整体不可译',
    translators: ['prisma', 'sql'],
  },
  {
    op: '!',
    semantics: '非（操作数为裸字段引用时权限侧另表"为空"语义）',
    operands: '单个子规则；权限侧 {"!":{"var":"f"}} 为空检测，SQL 侧仅支持对子规则取非',
    translators: ['prisma', 'sql'],
  },
  {
    op: '==',
    semantics: '宽松相等',
    operands: '[{"var":"字段"}, 标量字面量]；null 字面量走 IS NULL / 为空语义',
    translators: ['prisma', 'sql'],
  },
  {
    op: '!=',
    semantics: '宽松不等',
    operands: '[{"var":"字段"}, 标量字面量]；null 字面量走 IS NOT NULL',
    translators: ['prisma', 'sql'],
  },
  {
    op: '>',
    semantics: '大于',
    operands: '[{"var":"字段"}, 数值或字符串字面量]；SQL 侧数值字面量走 regex 守卫 cast',
    translators: ['prisma', 'sql'],
  },
  {
    op: '>=',
    semantics: '大于等于',
    operands: '同 >',
    translators: ['prisma', 'sql'],
  },
  {
    op: '<',
    semantics: '小于',
    operands: '同 >',
    translators: ['prisma', 'sql'],
  },
  {
    op: '<=',
    semantics: '小于等于',
    operands: '同 >',
    translators: ['prisma', 'sql'],
  },
  {
    op: 'in',
    semantics: '属于集合（两翻译器共有语义）',
    operands:
      '[{"var":"字段"}, [v1, v2, ...]] 标量数组；权限侧另有 [needle, {"var":"字段"}] 字符串包含扩展语义',
    translators: ['prisma', 'sql'],
  },
  {
    op: '===',
    semantics: '严格相等（仅 SQL 下推侧）',
    operands: '同 ==',
    translators: ['sql'],
  },
  {
    op: '!==',
    semantics: '严格不等（仅 SQL 下推侧）',
    operands: '同 !=',
    translators: ['sql'],
  },
  {
    op: '!!',
    semantics: '不为空检测（仅权限侧）',
    operands: '{"!!":{"var":"字段"}}',
    translators: ['prisma'],
  },
  {
    op: 'relative_date',
    semantics:
      '相对日期区间（仅权限侧；today/yesterday/last_7_days/last_30_days/this_week/this_month/this_quarter/this_year）',
    operands: '[{"var":"日期字段"}, 预设名]',
    translators: ['prisma'],
  },
] as const;

/** 指定翻译器支持的操作符集合。 */
export function jsonlogicSupportedOperators(translator: JsonLogicTranslator): Set<string> {
  return new Set(
    JSONLOGIC_OPERATOR_CONTRACTS.filter((c) => c.translators.includes(translator)).map((c) => c.op),
  );
}

/** 指定操作符的契约（未知操作符返回 undefined）。 */
export function jsonlogicOperatorContract(op: string): JsonLogicOperatorContract | undefined {
  return JSONLOGIC_OPERATOR_CONTRACTS.find((c) => c.op === op);
}

/**
 * 深度收集 JsonLogic 规则引用的操作符（单键对象视为操作符节点，递归其值）。
 * 多键对象不是合法操作符节点（翻译器会拒绝），其键不收集、值仍递归。
 */
export function collectJsonLogicOperators(
  rule: unknown,
  out: Set<string> = new Set(),
): Set<string> {
  if (rule === null || typeof rule !== 'object') return out;
  if (Array.isArray(rule)) {
    for (const item of rule) collectJsonLogicOperators(item, out);
    return out;
  }
  const entries = Object.entries(rule as Record<string, unknown>);
  if (entries.length === 1) out.add(entries[0]![0]);
  for (const value of Object.values(rule as Record<string, unknown>)) {
    collectJsonLogicOperators(value, out);
  }
  return out;
}

/**
 * 静态子集检查：表达式引用的操作符是否都在指定翻译器的可译子集内。
 * 仅操作符层面（操作数形状/引用合法性由各翻译器自身判定）——用途：
 * 方言指南静态提示、锚定测试、诊断信息；不替代翻译器的运行时校验。
 */
export function findUnsupportedOperators(rule: unknown, translator: JsonLogicTranslator): string[] {
  const supported = jsonlogicSupportedOperators(translator);
  return [...collectJsonLogicOperators(rule)].filter((op) => !supported.has(op)).sort();
}
