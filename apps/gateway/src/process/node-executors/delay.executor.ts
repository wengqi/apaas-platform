/**
 * DelayExecutor — 延时节点。
 *
 * 定位：流程暂停指定时长后继续。
 * 配置项（node.data）：duration（数值）/ unit（SECONDS/MINUTES/HOURS/DAYS）。
 *
 * 实现：通过 BullMQ delayed job 实现异步延时。
 *  1. 调用 ctx.scheduleDelay() 调度 delayed job（到时由 Worker 恢复令牌）
 *  2. 返回 { wait: true } 暂停引擎推进
 *  3. delayed job 到时后调用 ProcessEngine.resumeDelayedNode() 恢复
 *
 * 无 60s 上限（BullMQ delayed job 支持任意时长）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

/** 延时单位 → 毫秒换算。 */
const UNIT_TO_MS: Record<string, number> = {
  SECONDS: 1000,
  MINUTES: 60_000,
  HOURS: 3_600_000,
  DAYS: 86_400_000,
  // 兼容小写
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

@Injectable()
export class DelayExecutor implements NodeExecutor {
  private readonly logger = Logger;
  readonly type = 'delay';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const duration = Number(data['duration'] ?? ctx.inputs['duration'] ?? 0);
    const unit = (data['unit'] as string) ?? 'SECONDS';
    const ms = Math.max(0, duration * (UNIT_TO_MS[unit] ?? 1000));

    if (ms > 0) {
      // 调度 BullMQ delayed job，到时恢复令牌
      await ctx.scheduleDelay(ctx.instance.id, ctx.node.id, ms);
    }

    // 返回 wait: true 暂停引擎推进（由 delayed job 恢复）
    return {
      output: { delayedMs: ms },
      wait: ms > 0,
    };
  }
}
