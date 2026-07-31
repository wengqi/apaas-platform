/**
 * TriggerExecutor — 触发器节点。
 *
 * 定位：流程入口节点，定义触发条件。
 * 执行逻辑：不主动执行（由触发器监听器在事件发生时创建实例）。
 * 此处解析触发上下文（存于 instance.triggerContext）并作为节点输出注入变量作用域，
 * 供下游节点 ref 引用（如 trigger_0.output.recordId / triggeredByUser / inputs）。
 */

import { Injectable } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class TriggerExecutor implements NodeExecutor {
  readonly type = 'trigger';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const triggerContext =
      (ctx.instance.triggerContext as Record<string, unknown>) ?? {};
    return {
      output: { ...triggerContext },
    };
  }
}
