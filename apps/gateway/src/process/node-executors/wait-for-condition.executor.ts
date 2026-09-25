/**
 * WaitForConditionExecutor — 等待条件节点。
 *
 * 定位：暂停流程直到外部状态使条件成立（如"记录状态变为 DONE"）。
 * 配置项（node.data）：condition（JsonLogic JSON 或 JSON 字符串）/ pollIntervalMs（轮询间隔，
 *   默认 60s）/ timeoutMs（超时，默认 24h）。
 * 执行逻辑：条件满足 → 直接通过；未满足 → 通过 BullMQ delayed job 调度重新检查
 *   （kind='wait_condition'，事件驱动非 setInterval）→ 引擎 ProcessEngine.resumeWaitCondition()
 *   到时重新求值；超时后路由 label 为 timeout 的出边，未配置则实例置 FAILED。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { evaluateCondition } from '../process-utils.js';

/** 首次等待的默认轮询间隔（ms）— 与引擎 DEFAULT_WAIT_CONDITION_POLL_MS 保持一致。 */
const DEFAULT_POLL_MS = 60_000;

/** 轮询间隔下限（ms），防止误配置为过小值造成 Redis 压力。 */
const MIN_POLL_MS = 1_000;

@Injectable()
export class WaitForConditionExecutor implements NodeExecutor {
  private readonly logger = new Logger(WaitForConditionExecutor.name);
  readonly type = 'wait_for_condition';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;

    // 首次求值：满足则直接通过（支持常量 JSON 对象与 JSON 字符串两种配置形态）
    const conditionRaw = data['condition'];
    if (conditionRaw) {
      try {
        const rule = typeof conditionRaw === 'string' ? JSON.parse(conditionRaw) : conditionRaw;
        if (evaluateCondition(rule, ctx.variables)) {
          return { output: { satisfied: true } };
        }
      } catch (err) {
        throw new Error(
          `等待条件节点 ${ctx.node.id} 的 condition 配置无效: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.logger.warn(`等待条件节点 ${ctx.node.id} 未配置 condition，视为立即满足`);
      return { output: { satisfied: true } };
    }

    // 未满足：调度重新检查并暂停
    const pollMs = Math.max(MIN_POLL_MS, Number(data['pollIntervalMs'] ?? DEFAULT_POLL_MS));
    await ctx.scheduleDelay(ctx.instance.id, ctx.node.id, pollMs, 'wait_condition');

    return { output: { satisfied: false, pollMs }, wait: true };
  }
}
