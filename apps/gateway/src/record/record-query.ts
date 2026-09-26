/**
 * 记录查询助手（评审 A-H1）。
 *
 * 背景：records 采用 JSONB 宽表，业务字段在 `data` 列内。此前过滤条件被翻译为
 * Prisma 的 `path` 查询（编译为 `data->'f' = x` / `data->>'f' LIKE ...`），
 * 这类算子**无法命中 GIN 索引**（默认 jsonb_ops 仅加速 `@>`/`?`/`?|`/`?&`）；
 * 业务字段排序则退化为整列 JSONB 排序（按 JSON 二进制序，语义错误）。
 *
 * 本模块提供两类纯函数（便于单测，不含 IO）：
 *  1. containment 提取：把可下推的等值条件（AND 树内的 `==`）提取为 jsonb 包含
 *     对象，使其可通过 `data @> $1::jsonb` 命中 GIN 索引；
 *  2. 业务字段排序：生成带类型转换与 NULLS LAST 的 ORDER BY 片段，
 *     以及不支持下推时的内存比较器。
 */

/** 数值型字段（排序按数字语义，需 cast numeric） */
const NUMERIC_FIELD_TYPES = new Set(['number', 'currency', 'percent', 'auto_number']);

/** 合法字段名（防注入；与 ObjectMeta.fields[].apiName 规则一致） */
const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** 字段定义的最小结构（ObjectMeta.fields 元素） */
export interface SortableField {
  apiName: string;
  type: string;
}

/** containment 提取结果 */
export interface ContainmentExtraction {
  /** 可下推为 jsonb `@>` 的等值条件（各条件为 AND 关系） */
  containment: Record<string, unknown>;
  /** 未能下推的剩余条件（仍由 Prisma 处理）；null 表示已全部下推 */
  rest: unknown | null;
}

/**
 * 从 JsonLogic 规则中提取可下推为 `data @> {...}` 的等值条件。
 *
 * 仅处理：AND 树内的 `{"==": [{"var":"field"}, 标量]}`（字段名为单层 apiName）。
 * 其余节点（LIKE/比较运算/OR/NOT/嵌套 var 等）原样保留在 rest 中。
 * containment 是原条件的**必要子条件**（AND 语义），因此作为预过滤使用不会改变结果集。
 *
 * @returns null 表示没有任何可下推条件
 */
export function extractContainmentFilter(rule: unknown): ContainmentExtraction | null {
  const containment: Record<string, unknown> = {};
  const rest: unknown[] = [];

  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node !== 'object' || Array.isArray(node)) {
      rest.push(node);
      return;
    }
    const entries = Object.entries(node as Record<string, unknown>);

    const key = entries[0]?.[0];
    const value = entries[0]?.[1];

    // {"and": [...]} → 展平递归
    if (entries.length === 1 && key === 'and' && Array.isArray(value)) {
      for (const child of value as unknown[]) visit(child);
      return;
    }

    // {"==": [{"var":"field"}, 标量]}
    if (entries.length === 1 && key === '==' && Array.isArray(value)) {
      const [left, right] = value as [unknown, unknown];
      const field = extractVarPath(left);
      if (field && isContainmentScalar(right)) {
        containment[field] = right;
        return;
      }
    }

    rest.push(node);
  };

  visit(rule);

  if (Object.keys(containment).length === 0) return null;
  return {
    containment,
    rest: rest.length > 0 ? (rest.length === 1 ? rest[0] : { and: rest }) : null,
  };
}

/** 取 `{"var":"field"}` 的单层字段名（不含点路径/数组索引） */
function extractVarPath(node: unknown): string | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const varPath = (node as Record<string, unknown>)['var'];
  if (typeof varPath !== 'string') return null;
  if (!FIELD_NAME_RE.test(varPath)) return null;
  return varPath;
}

/** jsonb 包含条件支持的标量值（不含 null/对象/数组） */
function isContainmentScalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** 排序项 */
export interface SortSpec {
  field: string;
  dir: 'asc' | 'desc';
}

/**
 * 解析排序参数；无法解析返回 null。
 * 兼容两种词形：`asc|desc`（本项目约定）与 `ascend|descend`（AntD Table sorter）。
 */
export function parseSortSpec(sort?: string): SortSpec | null {
  if (!sort) return null;
  const [field, orderStr] = sort.split(':');
  if (!field || !FIELD_NAME_RE.test(field)) return null;
  const raw = (orderStr ?? '').toLowerCase();
  return { field, dir: raw === 'asc' || raw === 'ascend' ? 'asc' : 'desc' };
}

/**
 * 生成业务字段 ORDER BY 片段（含类型转换与 NULLS LAST）。
 *
 * 数值型字段 cast numeric（避免字典序：'10' < '9'）；日期/日期时间保留文本比较
 * （ISO-8601 字典序与时间序一致，且避免非法值 cast 报错）。
 *
 * @param alias 表别名（默认 r）
 * @returns SQL 片段；任一字段不在白名单（ObjectMeta.fields）内则返回 null
 */
export function buildFieldOrderSql(
  sorts: SortSpec[],
  fields: SortableField[],
  alias = 'r',
): string | null {
  const byName = new Map(fields.map((f) => [f.apiName, f]));
  const parts: string[] = [];

  for (const { field, dir } of sorts) {
    const def = byName.get(field);
    if (!def || !FIELD_NAME_RE.test(field)) return null;
    const expr = NUMERIC_FIELD_TYPES.has(def.type)
      ? `(${alias}.data->>'${field}')::numeric`
      : `${alias}.data->>'${field}'`;
    parts.push(`${expr} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * 业务字段值比较器（不支持下推时用于内存排序）。
 * null/undefined 恒排在最后（与 SQL 的 NULLS LAST 保持一致）。
 */
export function compareFieldValues(a: unknown, b: unknown, type: string): number {
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (NUMERIC_FIELD_TYPES.has(type)) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return na === nb ? 0 : na > nb ? 1 : -1;
  }

  const sa = String(a);
  const sb = String(b);
  return sa === sb ? 0 : sa > sb ? 1 : -1;
}
