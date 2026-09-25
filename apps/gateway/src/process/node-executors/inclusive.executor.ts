/**
 * InclusiveExecutor — 包容分支节点（OR 分支）。
 *
 * 定位：多条件分支，所有条件满足的分支同时获得令牌（区别于 condition 的单分支）。
 * 配置项：出边上的 condition 字段（JsonLogic JSON）。
 * 执行逻辑：对每条出边求值 condition → 激活全部满足的边；
 *   无边满足时激活无条件边（else 语义）；仍无则降级取首条出边（避免流程卡死）。
 *   激活多个分支时，引擎在公共汇聚点注册等待（严格 OR-join）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { evaluateCondition } from '../process-utils.js';

@Injectable()
export class InclusiveExecutor implements NodeExecutor {
  private readonly logger = new Logger(InclusiveExecutor.name);
  readonly type = 'inclusive';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const matched: string[] = [];
    const unconditional: string[] = [];

    for (const edge of ctx.outgoingEdges) {
      if (!edge.condition) {
        unconditional.push(edge.targetNodeID);
        continue;
      }
      try {
        const rule =
          typeof edge.condition === 'string' ? JSON.parse(edge.condition) : edge.condition;
        if (evaluateCondition(rule, ctx.variables)) {
          matched.push(edge.targetNodeID);
        }
      } catch {
        this.logger.warn(
          `包容分支边 ${edge.sourceNodeID} → ${edge.targetNodeID} 条件解析失败，跳过`,
        );
      }
    }

    let nextNodeIds = matched.length > 0 ? matched : unconditional;
    if (nextNodeIds.length === 0 && ctx.outgoingEdges[0]) {
      this.logger.warn(`包容分支 ${ctx.node.id} 无满足条件的出边，降级取第一条出边`);
      nextNodeIds = [ctx.outgoingEdges[0].targetNodeID];
    }

    return { nextNodeIds };
  }
}
