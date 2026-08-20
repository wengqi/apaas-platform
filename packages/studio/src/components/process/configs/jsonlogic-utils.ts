/**
 * JsonLogic 工具函数 —— JsonLogic JSON → 表达式文本（只读展示用）。
 *
 * JsonLogic 是一种跨语言的逻辑序列化标准（jsonlogic.com）：
 * - 安全：无 eval、无副作用、确定性计算
 * - 可序列化：原生 JSON，可存储到数据库
 * - 跨语言：JS / Python / Java / PHP / Ruby / Go
 *
 * 本文件仅提供 jsonLogicToExpression（JsonLogic → 可读文本），
 * 用于画布上条件分支的文本展示（SimplifiedEditor.tsx）。
 * 条件编辑使用 RAQB 可视化模式，不再支持表达式文本编辑。
 */

// ---------------------------------------------------------------------------
// JsonLogic → 表达式文本
// ---------------------------------------------------------------------------

/**
 * JsonLogic JSON → 表达式文本（可读的 expr-eval 兼容语法）。
 *
 * 仅用于画布展示，不可逆（不输出括号，AND/OR 按出现顺序连接）。
 */
export function jsonLogicToExpression(rule: unknown): string {
  if (!rule || typeof rule !== 'object') return '';
  return formatRule(rule as Record<string, unknown>);
}

/** 递归格式化 JsonLogic 规则为表达式文本 */
function formatRule(rule: Record<string, unknown>): string {
  const keys = Object.keys(rule);
  if (keys.length !== 1) return '';

  const op = keys[0]!;
  const rawArgs = rule[op];

  // JsonLogic 的值可能是数组（and/or/比较）或单个对象（!）
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  switch (op) {
    case 'and':
      return (args as unknown[]).map((a) => formatRule(a as Record<string, unknown>)).join(' and ');
    case 'or':
      return (args as unknown[]).map((a) => formatRule(a as Record<string, unknown>)).join(' or ');
    case '!': {
      // "!" 可能是：isEmpty（内层是 var）、notContains/notIn（内层是 in）、not（通用）
      const innerRule = args[0] as Record<string, unknown>;
      const innerOp =
        innerRule && typeof innerRule === 'object' ? Object.keys(innerRule)[0] : undefined;

      // {"!": {"var": "field"}} → isEmpty(field)
      if (innerOp === 'var') {
        const fieldName = (innerRule!['var'] as string) ?? 'unknown';
        return `isEmpty(${fieldName})`;
      }

      if (innerOp === 'in') {
        // contains/notContains vs in/notIn 的区分：
        // - 第二个参数是数组 → in/notIn（多值语义）
        // - 第二个参数是标量 → contains/notContains（单值包含语义）
        const inArgs = innerRule!['in'] as unknown[];
        const [field, val] = extractFieldAndValue(inArgs[0], inArgs[1]);
        if (field === null) return `not(${formatRule(innerRule)})`;

        if (Array.isArray(val)) {
          return `notIn(${field}, [${formatArrayValue(val)}])`;
        }
        return `notContains(${field}, ${formatValue(val)})`;
      }

      // 通用 not(...)
      const inner = formatRule(innerRule);
      return `not(${inner})`;
    }
    case '!!': {
      // {"!!": {"var": "field"}} → isNotEmpty(field)
      const innerRule = args[0] as Record<string, unknown>;
      if (innerRule && typeof innerRule === 'object' && 'var' in innerRule) {
        const fieldName = (innerRule['var'] as string) ?? 'unknown';
        return `isNotEmpty(${fieldName})`;
      }
      return `not(not(${formatRule(innerRule)}))`;
    }
    case 'in': {
      // contains/in 的区分：第二个参数是数组 → in；标量 → contains
      const [field, val] = extractFieldAndValue(args[0], args[1]);
      if (field === null) return '';

      if (Array.isArray(val)) {
        return `in(${field}, [${formatArrayValue(val)}])`;
      }
      return `contains(${field}, ${formatValue(val)})`;
    }
    case '>':
    case '<':
    case '>=':
    case '<=':
    case '==':
    case '!=': {
      const fieldVar = args[0] as Record<string, unknown>;
      const fieldName = (fieldVar?.['var'] as string) ?? 'unknown';
      const val = formatValue(args[1]);
      return `${fieldName} ${op} ${val}`;
    }
    default:
      return '';
  }
}

/**
 * 从 `in` 操作符的两个参数中提取字段名和值。
 *
 * 参数顺序可能是 field-first 或 value-first，统一处理。
 */
function extractFieldAndValue(first: unknown, second: unknown): [string, unknown] | [null, null] {
  const firstIsVar =
    first && typeof first === 'object' && 'var' in (first as Record<string, unknown>);
  const secondIsVar =
    second && typeof second === 'object' && 'var' in (second as Record<string, unknown>);

  if (firstIsVar) {
    const fieldName = ((first as Record<string, unknown>)['var'] as string) ?? 'unknown';
    return [fieldName, second];
  }
  if (secondIsVar) {
    const fieldName = ((second as Record<string, unknown>)['var'] as string) ?? 'unknown';
    return [fieldName, first];
  }
  return [null, null];
}

/** 格式化值为表达式文本 */
function formatValue(val: unknown): string {
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  return 'null';
}

/** 格式化数组值为表达式文本：["a","b"] → `"a", "b"` */
function formatArrayValue(val: unknown): string {
  if (Array.isArray(val)) {
    return val.map((v) => formatValue(v)).join(', ');
  }
  return formatValue(val);
}
