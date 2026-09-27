/**
 * 流程执行器 — 操作者解析（评审 P1-5）。
 *
 * 流程写记录时需要 createdBy/updatedBy。优先取触发上下文中的发起人
 * （手动启动的 triggeredByUser、记录触发时的 created_by 等），
 * 无用户上下文（定时/Webhook/子流程等系统自动化）时回落为系统操作者标识。
 *
 * 注：Record.createdBy/updatedBy 为无外键的文本列，系统标识不会破坏引用完整性。
 */

import type { ExecutionContext } from '../types.js';

/** 系统操作者标识（流程自动写入且无发起人时使用）。 */
export const SYSTEM_ACTOR_ID = 'system';

/** 从执行上下文解析操作者用户 ID。 */
export function resolveFlowActorId(ctx: ExecutionContext): string {
  const triggerContext = (ctx.instance?.triggerContext ?? {}) as Record<string, unknown>;

  const candidates: unknown[] = [
    triggerContext['triggeredByUser'],
    triggerContext['startedBy'],
    triggerContext['created_by'],
    (ctx.variables?.['global'] as Record<string, unknown> | undefined)?.['triggeredByUser'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return SYSTEM_ACTOR_ID;
}
