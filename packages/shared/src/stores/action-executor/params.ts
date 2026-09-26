/**
 * 事件动作执行器 — 参数解析（从 action-executor.ts 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import type { PropValue } from '../types.js';
import { resolvePropValue } from '../expression-engine.js';
import type { EvalContext } from '../expression-engine.js';
import type { ActionContext } from './types.js';

/** 解析单个动作参数（字面量 / 绑定 / 表达式 → 实际值）。 */
export function resolveParam(
  params: Record<string, PropValue> | undefined,
  key: string,
  context: ActionContext,
): unknown {
  const raw = params?.[key];
  if (raw === undefined) return undefined;
  const evalCtx: EvalContext = { vm: context.vm };
  return resolvePropValue(raw, evalCtx);
}

/** 解析参数为字符串。 */
export function paramAsString(
  params: Record<string, PropValue> | undefined,
  key: string,
  context: ActionContext,
): string {
  const v = resolveParam(params, key, context);
  if (v == null) return '';
  return String(v);
}

/** 解析参数为普通对象。 */
export function paramAsObject(
  params: Record<string, PropValue> | undefined,
  key: string,
  context: ActionContext,
): Record<string, unknown> {
  const v = resolveParam(params, key, context);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}
