/**
 * ConditionExecutor — 条件分支节点（IF/ELSE）。
 *
 * 定位：二分或多分条件分支，根据条件表达式选择执行路径。
 * 配置项（node.data.conditions）：ConditionBranch[]，含 label + condition；末分支 condition 为空 = else。
 * 执行逻辑：依次求值各分支 condition，首个满足的分支获得令牌；
 *   按分支 label 匹配出边，返回对应 targetNodeID。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { evaluateCondition } from '../process-utils.js';

/** 条件分支配置。 */
interface ConditionBranch {
  label: string;
  condition?: object | null; // JsonLogic JSON，空 = else/default
}

@Injectable()
export class ConditionExecutor implements NodeExecutor {
  private readonly logger = new Logger(ConditionExecutor.name);
  readonly type = 'condition';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const branches =
      (data['conditions'] as ConditionBranch[]) ?? (data['branches'] as ConditionBranch[]) ?? [];

    // 依次求值，找首个满足的分支
    let chosenLabel: string | undefined;
    for (const branch of branches) {
      if (!branch.condition) {
        // else 分支：仅当无其它分支满足时才走，先记录备用
        if (!chosenLabel) chosenLabel = branch.label;
        continue;
      }
      if (evaluateCondition(branch.condition, ctx.variables)) {
        chosenLabel = branch.label;
        break;
      }
    }

    if (!chosenLabel) {
      // 无匹配且无 else：取第一条出边（避免流程卡死）
      const fallback = ctx.outgoingEdges[0];
      return { nextNodeIds: fallback ? [fallback.targetNodeID] : [] };
    }

    // 按分支 label 匹配出边
    const matched = ctx.outgoingEdges.find((e) => e.label === chosenLabel);
    if (matched) {
      return { nextNodeIds: [matched.targetNodeID] };
    }

    // label 未匹配出边：降级取第一条出边
    this.logger.warn(`条件分支 label="${chosenLabel}" 未匹配到出边，降级取第一条出边`);
    const fallback = ctx.outgoingEdges[0];
    return { nextNodeIds: fallback ? [fallback.targetNodeID] : [] };
  }
}
