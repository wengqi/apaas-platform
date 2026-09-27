/**
 * 事件动作执行器（运行时 MVP）— 跨 studio / runtime-ui 共享。
 *
 * 实现 PRD §6.2 的 12 种 ActionType，以及 §6.4 的动作链串行执行
 *（含 condition 条件跳过与 confirm 取消中断）。动作参数中的
 * `{ __bind }` / `{ __expr }` 在执行时实时求值（§6.4 规则 5）。
 *
 * 通过 RuntimeStoreAdapter 注入 API 调用，使核心逻辑与具体 HTTP 客户端解耦。
 * studio 注入 objectsApi/processesApi adapter，runtime-ui 注入 apiClient adapter。
 *
 * 实现细节按职责拆分到 ./action-executor/ 子目录（AGENTS.md 单文件 400 行规范），
 * 本文件保留原导出面（对外 API 不变）。
 */

import { message } from 'antd';
import type { ActionConfig } from './types.js';
import { evalExpr } from './expression-engine.js';
import { executeAction } from './action-executor/actions.js';
import { ActionChainInterrupt } from './action-executor/interrupt.js';
import type { ActionContext, RuntimeStoreAdapter } from './action-executor/types.js';

export type {
  RecordListResult,
  RuntimeStoreAdapter,
  ActionContext,
} from './action-executor/types.js';
export { executePageScript } from './action-executor/script.js';
export { ActionChainInterrupt } from './action-executor/interrupt.js';
export { executeAction } from './action-executor/actions.js';

// ---------------------------------------------------------------------------
// 动作链执行
// ---------------------------------------------------------------------------

/** 错误提示（动作链失败时统一 toast）。 */
function toastError(err: unknown): void {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '动作执行失败';
  message.error(msg);
}

/**
 * 串行执行动作链（§6.4 / §8.5）。
 *
 * 规则：
 * 1. 按数组顺序串行执行。
 * 2. 每个动作执行前检查 `condition`，为 false 则跳过。
 * 3. `confirm` 取消（抛 ActionChainInterrupt）→ 中断链，不提示错误。
 * 4. 其他失败 → toast 错误并中断。
 */
export async function executeActionChain(
  actions: ActionConfig[],
  context: ActionContext,
  adapter: RuntimeStoreAdapter,
): Promise<void> {
  for (const action of actions) {
    // 条件判断
    if (action.condition?.__expr) {
      const ok = evalExpr(action.condition.__expr, { vm: context.vm });
      if (!ok) continue;
    }

    try {
      await executeAction(action, context, adapter);
    } catch (err) {
      if (err instanceof ActionChainInterrupt) break; // confirm 取消，静默中断
      toastError(err);
      break; // 失败中断
    }
  }
}
