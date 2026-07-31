/**
 * ParallelExecutor — 并行分支节点（AND）。
 *
 * 定位：所有分支并行执行，汇聚处等待全部完成。
 * 执行逻辑：分裂令牌到所有出边分支并行执行。
 *   返回全部出边目标作为下一节点，引擎为每个分支创建待执行 NodeExecution。
 *
 * 注：MVP 的汇聚（join）采用简化策略——多分支令牌到达同一节点时，
 * 首个到达即执行，后续到达忽略（非严格 AND-join）。
 */

import { Injectable } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class ParallelExecutor implements NodeExecutor {
  readonly type = 'parallel';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    // 分裂令牌到所有出边分支
    const nextNodeIds = ctx.outgoingEdges.map((e) => e.targetNodeID);
    return { nextNodeIds };
  }
}
