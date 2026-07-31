/**
 * DelayExecutor — 延时节点。
 *
 * 定位：流程暂停指定时长后继续。
 * 配置项（node.data）：duration（数值）/ unit（SECONDS/MINUTES/HOURS/DAYS）。
 * 执行逻辑：调度延时任务，到点后恢复令牌。
 *
 * MVP 简化实现：用 setTimeout 在进程内等待（任务约定：Redis 未就绪时先用 setTimeout 简化）。
 * 生产环境应改用 BullMQ delayed job 以保障崩溃恢复。
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
  private readonly logger = new Logger(DelayExecutor.name);
  readonly type = 'delay';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const duration = Number(data['duration'] ?? ctx.inputs['duration'] ?? 0);
    const unit = (data['unit'] as string) ?? 'SECONDS';
    const ms = Math.max(0, duration * (UNIT_TO_MS[unit] ?? 1000));

    // 上限 60s，避免进程内长延时阻塞过久（MVP 保护）
    const cappedMs = Math.min(ms, 60_000);
    if (cappedMs !== ms) {
      this.logger.warn(
        `延时 ${ms}ms 超过 60s 上限，已截断为 60s（MVP setTimeout 限制）`,
      );
    }

    if (cappedMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, cappedMs));
    }

    return { output: { delayedMs: cappedMs } };
  }
}
