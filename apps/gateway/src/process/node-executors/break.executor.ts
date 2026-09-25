/**
 * BreakExecutor — 跳出循环节点。
 *
 * 定位：立即终止所在循环，令牌跳到循环的完成边（不经过循环节点的迭代推进）。
 * 归属循环：优先读 data.loopNodeId（编辑器配置）；否则由图分析自动查找（内层优先）。
 * 执行逻辑：清除循环迭代状态（variables._loops）→ 路由到循环的完成边目标。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { classifyLoopEdges, findEnclosingLoops } from '../loop-utils.js';

/** 引擎内部循环状态在变量作用域中的键（与 LoopExecutor 一致）。 */
const LOOP_STATE_KEY = '_loops';

@Injectable()
export class BreakExecutor implements NodeExecutor {
  private readonly logger = new Logger(BreakExecutor.name);
  readonly type = 'break';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const configured = data['loopNodeId'] as string | undefined;
    const loopId = configured ?? findEnclosingLoops(ctx.schema, ctx.node.id, false)[0];

    if (!loopId) {
      this.logger.warn(`break 节点 ${ctx.node.id} 不在任何循环体内，令牌终止`);
      return { nextNodeIds: [] };
    }

    // 清除循环迭代状态（该次循环不再继续）
    const loops = (ctx.variables[LOOP_STATE_KEY] as Record<string, unknown> | undefined) ?? {};
    if (loops[loopId]) {
      delete loops[loopId];
      if (Object.keys(loops).length === 0) delete ctx.variables[LOOP_STATE_KEY];
    }

    const { doneTargets } = classifyLoopEdges(ctx.schema, loopId);
    if (doneTargets.length === 0) {
      this.logger.warn(`循环节点 ${loopId} 无完成边，break 后令牌终止`);
      return { output: { brokeLoop: loopId }, nextNodeIds: [] };
    }

    return { output: { brokeLoop: loopId }, nextNodeIds: doneTargets };
  }
}
