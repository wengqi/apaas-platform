/**
 * ContinueExecutor — 继续下一次循环节点。
 *
 * 定位：跳过本次迭代剩余节点，令牌直接回到循环节点（由循环节点推进下一次迭代）。
 * 归属循环：优先读 data.loopNodeId（编辑器配置）；否则由图分析自动查找（内层优先，
 * 要求 continue 节点能沿边回到循环节点）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { findEnclosingLoops } from '../loop-utils.js';

@Injectable()
export class ContinueExecutor implements NodeExecutor {
  private readonly logger = new Logger(ContinueExecutor.name);
  readonly type = 'continue';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const configured = data['loopNodeId'] as string | undefined;
    const loopId = configured ?? findEnclosingLoops(ctx.schema, ctx.node.id, true)[0];

    if (!loopId) {
      this.logger.warn(`continue 节点 ${ctx.node.id} 不在任何循环体内，令牌终止`);
      return { nextNodeIds: [] };
    }

    return { output: { continuedLoop: loopId }, nextNodeIds: [loopId] };
  }
}
