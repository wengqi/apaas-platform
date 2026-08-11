/**
 * BlockExecutor — 分支容器节点（透传执行器）。
 *
 * 定位：条件分支节点的分支容器（type='block'），是编辑器树结构的中间节点。
 * 执行逻辑：将令牌透传到首个出边目标（block 内的首个业务子节点）。
 *
 * 条件执行器选择分支后，令牌到达 block 容器，BlockExecutor 将其转发到
 * block 内部的第一个业务子节点，使流程继续执行分支内的节点链。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class BlockExecutor implements NodeExecutor {
  private readonly logger = new Logger(BlockExecutor.name);
  readonly type = 'block';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    // 透传：令牌流向 block 的首个出边目标（block 内的首个业务子节点）
    const firstEdge = ctx.outgoingEdges[0];
    if (!firstEdge) {
      this.logger.warn(`Block 节点 ${ctx.node.id} 无出边，令牌终止`);
      return { nextNodeIds: [] };
    }
    return { nextNodeIds: [firstEdge.targetNodeID] };
  }
}
