/**
 * 资源快照结构化 diff（R1.2 diff 快审的共享内核）。
 *
 * 设计取舍：不引入通用 JSON diff 库，按「数组身份键」做结构 diff——
 * 对象字段按 apiName、流程节点按 id/key、amis 组件树尽量按 id，
 * 产出人读路径与标签（评审可读性优先于最小编辑距离）。
 * 无身份键的数组退化为整体比较（一个 MODIFIED 条目）。
 * gateway（提交摘要）与 studio（diff 渲染）共用同一实现。
 */

import type {
  ObjectResourceSnapshot,
  PageResourceSnapshot,
  ProcessResourceSnapshot,
  ResourceDiff,
  ReviewDiffItem,
  ReviewModule,
} from './types.js';

/** 单资源 diff 条目上限（超出后只计数不再展开，防止超大 schema 刷屏） */
const MAX_DIFF_ITEMS = 200;

/** MODIFIED detail 的旧/新值单侧截断长度 */
const DETAIL_MAX = 60;

/** 对象字段在 diff 标签中的显示字段优先级 */
const LABEL_KEYS = ['label', 'name', 'apiName', 'title', 'id'] as const;

/** 从展示对象取人读标签（label/name/apiName/... 优先） */
function labelOf(value: unknown, fallback: string): string {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of LABEL_KEYS) {
      const v = record[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return fallback;
}

/** 数组元素的身份键（对齐资源主键约定：apiName > id > key > name） */
function identityKey(item: unknown): string | undefined {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const record = item as Record<string, unknown>;
  for (const key of ['apiName', 'id', 'key', 'name'] as const) {
    const v = record[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** 值摘要（截断） */
function summarize(value: unknown): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX)}…` : text;
}

/** 键序无关的深度相等（脏检测与 diff 内部判定共用） */
export function stableStringifyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => stableStringifyEqual(item, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).sort();
  const kb = Object.keys(rb).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((key, i) => key === kb[i] && stableStringifyEqual(ra[key], rb[key]));
}

/** 路径拼接（根为空串时不加分隔符） */
function joinPath(path: string, seg: string): string {
  return path.length === 0 ? seg : `${path}.${seg}`;
}

/**
 * 递归结构 diff：baseline → submitted 的差异条目追加进 items。
 * 计数不受 MAX_DIFF_ITEMS 影响；条目达到上限后不再收集明细。
 */
function diffJson(
  baseline: unknown,
  submitted: unknown,
  path: string,
  label: string,
  items: ReviewDiffItem[],
  counts: { added: number; modified: number; removed: number },
): void {
  const push = (item: ReviewDiffItem, op: keyof typeof counts): void => {
    counts[op] += 1;
    if (items.length < MAX_DIFF_ITEMS) items.push(item);
  };

  if (baseline === undefined) {
    // 新增数组：按身份键逐项展开（fields 新增字段逐条可读）；其余值整体一条
    if (Array.isArray(submitted)) {
      submitted.forEach((item, i) => {
        const key = identityKey(item);
        if (key === undefined) {
          push({ op: 'ADDED', path: `${path}[${i}]`, label: `${label}[${i}]` }, 'added');
        } else {
          diffJson(undefined, item, joinPath(path, key), labelOf(item, key), items, counts);
        }
      });
      return;
    }
    push({ op: 'ADDED', path, label, detail: summarize(submitted) }, 'added');
    return;
  }
  if (submitted === undefined) {
    push({ op: 'REMOVED', path, label, detail: summarize(baseline) }, 'removed');
    return;
  }
  if (stableStringifyEqual(baseline, submitted)) return;

  // 同为数组 → 按身份键配对；无身份键的元素按相对顺序配对
  if (Array.isArray(baseline) && Array.isArray(submitted)) {
    const baseKeyed = new Map<string, unknown>();
    const baseKeyless: unknown[] = [];
    for (const item of baseline) {
      const key = identityKey(item);
      if (key === undefined || baseKeyed.has(key)) baseKeyless.push(item);
      else baseKeyed.set(key, item);
    }
    const subKeyless: unknown[] = [];
    const seenKeys = new Set<string>();
    for (const item of submitted) {
      const key = identityKey(item);
      if (key === undefined || seenKeys.has(key)) subKeyless.push(item);
      else {
        seenKeys.add(key);
        const old = baseKeyed.get(key);
        if (old === undefined) {
          push({ op: 'ADDED', path: joinPath(path, key), label: labelOf(item, key) }, 'added');
        } else {
          diffJson(old, item, joinPath(path, key), labelOf(item, key), items, counts);
        }
      }
    }
    for (const [key, old] of baseKeyed) {
      if (!seenKeys.has(key)) {
        push({ op: 'REMOVED', path: joinPath(path, key), label: labelOf(old, key) }, 'removed');
      }
    }
    const paired = Math.min(baseKeyless.length, subKeyless.length);
    for (let i = 0; i < paired; i += 1) {
      diffJson(baseKeyless[i], subKeyless[i], `${path}[${i}]`, `${label}[${i}]`, items, counts);
    }
    for (let i = paired; i < subKeyless.length; i += 1) {
      push({ op: 'ADDED', path: `${path}[${i}]`, label: `${label}[${i}]` }, 'added');
    }
    for (let i = paired; i < baseKeyless.length; i += 1) {
      push({ op: 'REMOVED', path: `${path}[${i}]`, label: `${label}[${i}]` }, 'removed');
    }
    return;
  }

  // 同为普通对象 → 逐键比较
  if (
    baseline !== null &&
    submitted !== null &&
    typeof baseline === 'object' &&
    typeof submitted === 'object' &&
    !Array.isArray(baseline) &&
    !Array.isArray(submitted)
  ) {
    const rb = baseline as Record<string, unknown>;
    const rs = submitted as Record<string, unknown>;
    for (const key of new Set([...Object.keys(rb), ...Object.keys(rs)])) {
      diffJson(rb[key], rs[key], joinPath(path, key), key, items, counts);
    }
    return;
  }

  // 标量或类型变更 → 单条 MODIFIED
  push(
    {
      op: 'MODIFIED',
      path,
      label,
      detail: `${summarize(baseline)} → ${summarize(submitted)}`,
    },
    'modified',
  );
}

/** 计算资源快照 diff（baseline 为 null/undefined 表示全新资源，顶层键逐项新增） */
export function diffResource(
  module: ReviewModule,
  baseline: unknown,
  submitted: unknown,
): ResourceDiff {
  const items: ReviewDiffItem[] = [];
  const counts = { added: 0, modified: 0, removed: 0 };

  if (baseline === null || baseline === undefined) {
    // 全新资源：按顶层键展开（fields/schema/workflowSchema 逐键新增），而非整包一条
    if (submitted !== null && typeof submitted === 'object' && !Array.isArray(submitted)) {
      for (const key of Object.keys(submitted as Record<string, unknown>)) {
        diffJson(undefined, (submitted as Record<string, unknown>)[key], key, key, items, counts);
      }
    } else {
      diffJson(undefined, submitted, '', module, items, counts);
    }
  } else {
    diffJson(baseline, submitted, '', '', items, counts);
  }

  return {
    changeCount: counts.added + counts.modified + counts.removed,
    summary: `新增 ${counts.added} · 修改 ${counts.modified} · 删除 ${counts.removed}`,
    items,
  };
}

/** 对象快照 diff（仅业务字段 + 元信息，与快照规范形态一致） */
export function diffObjectResource(
  baseline: ObjectResourceSnapshot | null,
  submitted: ObjectResourceSnapshot,
): ResourceDiff {
  return diffResource('OBJECT', baseline, submitted);
}

/** 页面快照 diff */
export function diffPageResource(
  baseline: PageResourceSnapshot | null,
  submitted: PageResourceSnapshot,
): ResourceDiff {
  return diffResource('PAGE', baseline, submitted);
}

/** 流程快照 diff */
export function diffProcessResource(
  baseline: ProcessResourceSnapshot | null,
  submitted: ProcessResourceSnapshot,
): ResourceDiff {
  return diffResource('PROCESS', baseline, submitted);
}
