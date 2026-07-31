/**
 * StartExecutor — 开始节点。
 *
 * 定位：流程逻辑起点，定义流程输入参数。
 * 执行逻辑：将已解析的输入参数作为节点输出，供下游 ref 引用；令牌流向下一节点。
 */

import { Injectable } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class StartExecutor implements NodeExecutor {
  readonly type = 'start';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    // 输出 = 开始节点的输入参数（流程入参），下游可通过 ref 引用 start_x.output.xxx
    return {
      output: { ...ctx.inputs },
    };
  }
}
