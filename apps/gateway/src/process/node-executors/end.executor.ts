/**
 * EndExecutor — 结束节点。
 *
 * 定位：流程逻辑终点，可定义输出结果。
 * 执行逻辑：标记该分支令牌终止（无下一节点），引擎据此缩减活跃令牌。
 */

import { Injectable } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class EndExecutor implements NodeExecutor {
  readonly type = 'end';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    // 输出 = 结束节点的输入（流程最终输出，可选）；无下一节点，令牌终止
    return {
      output: { ...ctx.inputs },
      nextNodeIds: [],
    };
  }
}
