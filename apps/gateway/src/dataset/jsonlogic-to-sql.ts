/**
 * JsonLogic → SQL WHERE 片段翻译器（G5 数据下沉，纯函数）。
 *
 * 只翻译可安全下推的子集（标量比较 / and / or / ! / in）；
 * 不支持的形状返回 null，由调用方决定兜底策略（非聚合分支内存过滤 /
 * 聚合分支显式报错）。字段名走白名单正则（防注入），值一律走参数绑定。
 *
 * 语义对齐（对照内存引擎 json-logic-js 的 JS 宽松相等）：
 * - 比较统一按文本双侧行化（'100' == 100 与 JS 一致）；null 字面量走 IS NULL
 *   （缺失字段 == null → true，与 JS null == undefined 一致）
 * - 数值排序比较用 regex 守卫 cast：非数值字段 → NULL → 行被过滤
 *   （JS 'abc' > 5 为 false 一致；'abc' <= 5 为 true 而 SQL 过滤——已知 drift）
 */

/** 字段键白名单：字母/数字/下划线/点（点为字面 JSON 键，如 "orders.title"） */
const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/** 数值文本判定（SQL 端守卫 cast 用，与 JS Number() 可解析范围近似） */
export const NUMERIC_TEXT_RE = '^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$';

/** 翻译产出的 SQL 片段（占位符 $n + 顺序参数） */
export interface SqlFragment {
  text: string;
  params: unknown[];
}

/** 参数计数器（跨规则共享，保证 $n 单调） */
class ParamCounter {
  private n = 0;
  next(value: unknown, params: unknown[]): string {
    this.n += 1;
    params.push(value);
    return `$${this.n}`;
  }
}

/** 字段引用 → JSONB 文本提取表达式（键已过白名单，内联安全） */
function fieldText(key: string, dataCol: string): string {
  return `${dataCol}->>'${key.replace(/'/g, "''")}'`;
}

/** 标量字面量绑定（null 特判，其余按文本行化对齐 JS 宽松相等） */
function bindScalar(scalar: unknown, pc: ParamCounter, params: unknown[]): string | null {
  if (scalar === null || scalar === undefined) return null; // 由比较分支特判
  if (typeof scalar === 'object') return null; // 数组/对象字面量不在标量子集
  return pc.next(String(scalar), params);
}

/** 是否为 {"var": "key"} 字段引用 */
function isVarRef(node: unknown): node is { var: string } {
  return (
    (node !== null && typeof node === 'object' && !Array.isArray(node)
      ? Object.keys(node as Record<string, unknown>)
      : []
    ).length === 1 &&
    !!(node as Record<string, unknown>)['var'] !== false &&
    typeof (node as Record<string, unknown>)['var'] === 'string'
  );
}

/** 翻译比较运算（==/!= 与排序四则；操作数 = 字段引用 vs 标量，可换序） */
function translateComparison(
  op: string,
  operands: unknown[],
  dataCol: string,
  pc: ParamCounter,
  params: unknown[],
): SqlFragment | null {
  if (operands.length !== 2) return null;
  let [a, b] = operands;

  // 换序归一：字段引用放左侧（排序比较不换序——数值/文本语义对称，仅换操作符不需要）
  if (!isVarRef(a) && isVarRef(b) && op !== '>' && op !== '>=' && op !== '<' && op !== '<=') {
    [a, b] = [b, a];
  }
  if (!isVarRef(a)) return null;
  const key = (a as { var: string }).var;
  if (!FIELD_KEY_RE.test(key)) return null;
  const col = fieldText(key, dataCol);

  // 与另一字段比较 → 不支持（NULL==NULL 语义 drift）
  if (isVarRef(b)) return null;

  // null 字面量：缺失/JSON null 均视为相等（对齐 JS null == undefined）
  if (b === null || b === undefined) {
    if (op === '==' || op === '===') return { text: `${col} IS NULL`, params };
    if (op === '!=' || op === '!==') return { text: `${col} IS NOT NULL`, params };
    return null;
  }

  if (typeof b === 'object') return null; // 数组/对象字面量不支持

  if (op === '==' || op === '===') {
    return { text: `${col} = ${bindScalar(b, pc, params)}`, params };
  }
  if (op === '!=' || op === '!==') {
    return { text: `${col} <> ${bindScalar(b, pc, params)}`, params };
  }

  // 排序比较：数字字面量 → regex 守卫 cast（非数值 → NULL → 行过滤）；字符串字面量 → 文本比较
  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    if (typeof b === 'number') {
      const guarded = `CASE WHEN ${col} ~ '${NUMERIC_TEXT_RE}' THEN ${col}::numeric END`;
      return { text: `${guarded} ${op} ${pc.next(b, params)}`, params };
    }
    return { text: `${col} ${op} ${bindScalar(b, pc, params)}`, params };
  }
  return null;
}

/**
 * 翻译 JsonLogic 规则为 SQL 布尔片段。
 *
 * @param rule JsonLogic 规则（对象/标量）
 * @param dataCol 合并行 JSONB 列引用（如 `data`）
 * @returns 翻译结果；不支持/空规则返回 null
 */
export function translateJsonLogicToSql(
  rule: unknown,
  dataCol: string,
  startParamIndex = 0,
): SqlFragment | null {
  const params: unknown[] = [];
  const pc = new ParamCounter();
  // 调用方已占用的参数位以占位值对齐 $n 编号，最终切片移除
  for (let i = 0; i < startParamIndex; i += 1) {
    pc.next(`__reserved_${i}`, params);
  }

  const walk = (node: unknown): string | null => {
    if (node === null || node === undefined || typeof node !== 'object' || Array.isArray(node)) {
      return null; // 裸标量/数组不是规则
    }
    const entries = Object.entries(node as Record<string, unknown>);
    if (entries.length !== 1) return null;
    const [op, value] = entries[0]!;

    if (op === 'and' || op === 'or') {
      if (!Array.isArray(value) || value.length === 0) return null;
      const parts: string[] = [];
      for (const child of value) {
        const t = walk(child);
        if (t === null) return null;
        parts.push(`(${t})`);
      }
      return parts.join(op === 'and' ? ' AND ' : ' OR ');
    }

    if (op === '!') {
      const operand = Array.isArray(value) ? value[0] : value;
      const t = walk(operand);
      return t === null ? null : `NOT (${t})`;
    }

    if (op === 'in') {
      if (!Array.isArray(value) || value.length !== 2) return null;
      const [operand, list] = value;
      if (!isVarRef(operand) || !Array.isArray(list)) return null;
      const key = (operand as { var: string }).var;
      if (!FIELD_KEY_RE.test(key)) return null;
      const col = fieldText(key, dataCol);
      const binds = list.map((v) => {
        if (v === null || typeof v === 'object') return null;
        return pc.next(String(v), params);
      });
      if (binds.some((b) => b === null)) return null;
      return `${col} IN (${binds.join(', ')})`;
    }

    if (
      op === '==' ||
      op === '===' ||
      op === '!=' ||
      op === '!==' ||
      op === '>' ||
      op === '>=' ||
      op === '<' ||
      op === '<='
    ) {
      const frag = translateComparison(
        op,
        Array.isArray(value) ? value : [value],
        dataCol,
        pc,
        params,
      );
      return frag?.text ?? null;
    }

    return null; // var 裸真值/加減乘/map/filter 等一律不下推
  };

  const text = walk(rule);
  if (text === null) return null;
  return { text, params: params.slice(startParamIndex) };
}
