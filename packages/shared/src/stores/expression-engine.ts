/**
 * 表达式引擎（运行时 MVP）— 跨 studio / runtime-ui 共享。
 *
 * 解析组件属性中的绑定（`{ __bind }`）与内联表达式（`{ __expr }`），
 * 在预览模式/运行时为组件提供真实数据。语法子集见 PRD §2.4 / §8.3:
 *   - 属性访问：`vm.record.name`
 *   - 比较 / 逻辑：`vm.record.price > 0 && vm.record.qty > 0`
 *   - 三元：`vm.record.status == 'active' ? '已激活' : '未激活'`
 *   - 模板字符串：`{{vm.record.name}} - {{vm.record.code}}`
 *   - 内置函数：`NOW()` / `EMPTY(v)` / `LEN(v)`
 *
 * MVP 采用受限 `Function` 求值（仅注入 vm/record/list + 内置函数），
 * 不实现完整 JS 沙箱（对齐 PRD §2.4 约束）。
 */

import type { PropValue } from './types.js';

// ---------------------------------------------------------------------------
// 上下文
// ---------------------------------------------------------------------------

/** 表达式求值上下文：视图模型状态 + 当前记录 / 列表便捷别名。 */
export interface EvalContext {
  /** 视图模型变量值（运行时状态树，含 record/list/selectedId 等）。 */
  vm: Record<string, unknown>;
  /** 当前记录（别名，等价 vm.record）。 */
  record?: unknown;
  /** 当前列表（别名，等价 vm.list）。 */
  list?: unknown;
}

/** 求值作用域：表达式中的自由变量从此处取值。 */
interface EvalScope {
  vm: Record<string, unknown>;
  record: unknown;
  list: unknown;
  NOW: () => string;
  EMPTY: (v: unknown) => boolean;
  LEN: (v: unknown) => number;
}

// ---------------------------------------------------------------------------
// 内置函数
// ---------------------------------------------------------------------------

/** 当前时间（ISO 字符串）。 */
function NOW(): string {
  return new Date().toISOString();
}

/** 是否为空（null / undefined / 空串 / 空数组 / 空对象）。 */
function EMPTY(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}

/** 长度（字符串 / 数组 / 对象键数）。 */
function LEN(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'string' || Array.isArray(v)) return v.length;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length;
  return 0;
}

// ---------------------------------------------------------------------------
// 作用域构建
// ---------------------------------------------------------------------------

/** 由 EvalContext 构建求值作用域，补充 record/list 别名与内置函数。 */
function buildScope(ctx: EvalContext): EvalScope {
  const vm = ctx.vm ?? {};
  return {
    vm,
    record: ctx.record !== undefined ? ctx.record : vm.record,
    list: ctx.list !== undefined ? ctx.list : vm.list,
    NOW,
    EMPTY,
    LEN,
  };
}

// ---------------------------------------------------------------------------
// 路径取值（用于 __bind）
// ---------------------------------------------------------------------------

/** 按点分路径从 root 取值，任一段为 null/非对象则返回 undefined。 */
export function getByPath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// 求值核心
// ---------------------------------------------------------------------------

/** 模板字符串 `{{ ... }}` 检测。 */
const TEMPLATE_RE = /\{\{([^}]*)\}\}/;

/**
 * 求值单条表达式（非模板）。
 * 用 `new Function` 在受限作用域中执行；失败返回 undefined。
 */
function evalJs(code: string, scope: EvalScope): unknown {
  try {
    const keys = ['vm', 'record', 'list', 'NOW', 'EMPTY', 'LEN'];
    const vals: unknown[] = [scope.vm, scope.record, scope.list, scope.NOW, scope.EMPTY, scope.LEN];

    const fn = new Function(...keys, `"use strict"; return (${code});`);
    return fn(...vals);
  } catch {
    return undefined;
  }
}

/**
 * 解析表达式（可含 `{{ }}` 模板插值）。
 *
 * - 含 `{{ ... }}`：按模板插值，各段求值后拼为字符串。
 * - 否则：作为单条 JS 表达式求值，返回原始类型。
 */
export function evalExpr(expr: string, context: EvalContext): unknown {
  const trimmed = expr.trim();
  if (!trimmed) return undefined;

  const scope = buildScope(context);

  // 模板字符串：逐段插值
  if (TEMPLATE_RE.test(trimmed)) {
    return trimmed.replace(/\{\{([^}]*)\}\}/g, (_match, inner: string) => {
      const v = evalJs(inner.trim(), scope);
      return v == null ? '' : String(v);
    });
  }

  return evalJs(trimmed, scope);
}

// ---------------------------------------------------------------------------
// PropValue 解析
// ---------------------------------------------------------------------------

/** 判断是否为绑定表达式 `{ __bind }`。 */
function isBind(v: PropValue): v is { __bind: string } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && '__bind' in v;
}

/** 判断是否为内联表达式 `{ __expr }`。 */
function isExpr(v: PropValue): v is { __expr: string } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && '__expr' in v;
}

/** 判断是否为事件动作 `{ __action }`（不作为值解析）。 */
function isAction(v: PropValue): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && '__action' in v;
}

/** 递归解析 PropValue（常量直返 / 绑定取值 / 表达式求值 / 数组与对象递归）。 */
export function resolvePropValue(value: PropValue, context: EvalContext): unknown {
  if (value === null) return null;
  if (typeof value !== 'object') return value; // string / number / boolean

  if (Array.isArray(value)) {
    return value.map((item) => resolvePropValue(item, context));
  }

  if (isBind(value)) {
    const scope = buildScope(context);
    return getByPath(scope, value.__bind);
  }
  if (isExpr(value)) {
    return evalExpr(value.__expr, context);
  }
  if (isAction(value)) {
    // 动作配置不作为属性值解析，原样返回（由事件系统处理）
    return (value as { __action: unknown }).__action;
  }

  // 普通对象：逐键递归解析
  const out: Record<string, unknown> = {};
  const obj = value as Record<string, PropValue>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = resolvePropValue(v, context);
  }
  return out;
}
