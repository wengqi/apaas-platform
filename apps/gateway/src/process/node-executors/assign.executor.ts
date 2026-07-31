/**
 * AssignExecutor — 赋值/设置变量节点。
 *
 * 定位：设置或更新流程变量，用于中间计算与变量传递。
 * 配置项（node.data）：variableName（变量名）/ value（IFlowValue 四态绑定，经引擎解析后存于 inputs）。
 * 执行逻辑：将解析后的 value 写入全局变量作用域 variables.global[variableName]。
 */

import { Injectable } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class AssignExecutor implements NodeExecutor {
  readonly type = 'assign';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const variableName = (data['variableName'] as string) ?? (data['variable_name'] as string);
    // 解析后的值：优先从 inputs 取（编辑器将 value 配置为 inputsValues.value），
    // 兼容直接在 data.value 存放字面量
    const value = ctx.inputs['value'] ?? data['value'];

    if (variableName) {
      const global = (ctx.variables['global'] as Record<string, unknown>) ?? {};
      global[variableName] = value;
      ctx.variables['global'] = global;
    }

    return {
      output: { variableName, value },
    };
  }
}
