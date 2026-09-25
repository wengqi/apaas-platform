/**
 * LoopExecutor — 循环节点（for each）。
 *
 * 定位：遍历集合，对每个元素执行循环体。
 * 配置项（node.data）：maxIterations（最大迭代数，默认 1000）；
 *   集合来源：inputsValues.collection（四态值引用，如查询节点的 records）或 data.collection 常量。
 * 边约定（扁平边，自动分类）：体边 = 目标可回到循环节点（成环）；完成边 = 其余出边。
 * 状态：variables._loops[loopNodeId] = { index, items }（引擎内部状态，完成后清除）。
 * 输出（每次迭代覆盖）：{ index, item, total } — 体内节点以 {{loop_x.output.item}} 引用当前元素。
 * 执行逻辑：首次进入 → 快照集合并启动第一次迭代；循环体末节点连回循环节点 → 推进下一次迭代；
 *   遍历完成 → 清除状态并走完成边。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { classifyLoopEdges } from '../loop-utils.js';

/** 单循环默认最大迭代次数（与引擎循环预算 MAX_NODE_EXECUTIONS=1000 协同防呆）。 */
const DEFAULT_MAX_ITERATIONS = 1000;

/** 循环迭代状态（存储于 variables._loops[loopNodeId]）。 */
interface LoopState {
  index: number;
  items: unknown[];
}

/** 引擎内部循环状态在变量作用域中的键。 */
const LOOP_STATE_KEY = '_loops';

@Injectable()
export class LoopExecutor implements NodeExecutor {
  private readonly logger = new Logger(LoopExecutor.name);
  readonly type = 'loop';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const { bodyTargets, doneTargets } = classifyLoopEdges(ctx.schema, ctx.node.id);

    const loops = (ctx.variables[LOOP_STATE_KEY] as Record<string, LoopState> | undefined) ?? {};
    const state = loops[ctx.node.id];

    // —— 再入：循环体末节点连回循环节点，推进下一次迭代 ——
    if (state) {
      const nextIndex = state.index + 1;
      if (nextIndex >= state.items.length || bodyTargets.length === 0) {
        // 遍历完成：清除状态，走完成边
        delete loops[ctx.node.id];
        if (Object.keys(loops).length === 0) delete ctx.variables[LOOP_STATE_KEY];
        return {
          output: { total: state.items.length, iterations: state.items.length },
          nextNodeIds: doneTargets,
        };
      }
      state.index = nextIndex;
      return {
        output: { index: nextIndex, item: state.items[nextIndex], total: state.items.length },
        nextNodeIds: bodyTargets,
      };
    }

    // —— 首次进入：解析集合并启动第一次迭代 ——
    const collection = this.resolveCollection(ctx);
    const items = Array.isArray(collection) ? collection : [];
    const total = items.length;

    if (total === 0) {
      return { output: { total: 0, iterations: 0 }, nextNodeIds: doneTargets };
    }

    const maxIterations = Math.max(1, Number(data['maxIterations'] ?? DEFAULT_MAX_ITERATIONS));
    if (total > maxIterations) {
      throw new Error(
        `循环节点 ${ctx.node.id} 的集合长度 ${total} 超过 maxIterations ${maxIterations}`,
      );
    }

    loops[ctx.node.id] = { index: 0, items: [...items] };
    ctx.variables[LOOP_STATE_KEY] = loops;

    if (bodyTargets.length === 0) {
      this.logger.warn(`循环节点 ${ctx.node.id} 无体边（未成环），跳过循环体`);
      delete loops[ctx.node.id];
      return { output: { total, iterations: 0 }, nextNodeIds: doneTargets };
    }

    return {
      output: { index: 0, item: items[0], total },
      nextNodeIds: bodyTargets,
    };
  }

  /** 解析遍历集合：优先 inputsValues.collection（四态引用），回退 data.collection 常量。 */
  private resolveCollection(ctx: ExecutionContext): unknown {
    const fromInputs = ctx.inputs['collection'];
    if (fromInputs !== undefined) return fromInputs;
    return (ctx.node.data as Record<string, unknown>)['collection'];
  }
}
