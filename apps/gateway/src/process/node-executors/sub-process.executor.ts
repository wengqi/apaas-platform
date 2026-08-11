/**
 * SubProcessExecutor — 子流程调用节点。
 *
 * 定位：调用另一个已发布流程，实现流程复用与分层。
 * 配置项（node.data）：subProcessKey（子流程 apiName）/ subProcessDefId（直接指定流程定义ID）/
 *   sync（是否同步等待结果，MVP 始终同步）/ inputMapping（输入参数映射）。
 * 执行逻辑：通过 ctx.startSubProcess 启动子流程实例 → 写入子流程实例 ID。
 *
 * MVP 简化：以同步方式启动子流程实例后即继续（不阻塞等待子流程完成），
 *   子流程实例 ID 写入输出，供后续节点引用。真正的同步等待需 BullMQ 事件回调。
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class SubProcessExecutor implements NodeExecutor {
  private readonly logger = new Logger(SubProcessExecutor.name);
  readonly type = 'sub_process';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const subProcessDefId =
      (data['subProcessDefId'] as string | undefined) ??
      (data['sub_process_def_id'] as string | undefined);
    const subProcessKey =
      (data['subProcessKey'] as string | undefined) ??
      (data['sub_process_key'] as string | undefined);

    let defId = subProcessDefId;

    // 按 apiName 查找已发布的子流程定义（同应用内）
    if (!defId && subProcessKey) {
      const def = await prisma.processDef.findFirst({
        where: {
          tenantId: ctx.tenantId,
          appId: ctx.appId,
          apiName: subProcessKey,
          status: 'PUBLISHED',
        },
        orderBy: { version: 'desc' },
      });
      if (!def) {
        throw new NotFoundException(`子流程 ${subProcessKey} 未找到或未发布`);
      }
      defId = def.id;
    }

    if (!defId) {
      throw new Error('子流程节点缺少 subProcessDefId / subProcessKey');
    }

    // 构造子流程触发上下文：合并 global 与节点输入作为 inputs
    const globalVars = (ctx.variables['global'] as Record<string, unknown>) ?? {};
    const triggerContext: Record<string, unknown> = {
      triggeredBy: 'SUB_PROCESS',
      inputs: { ...globalVars, ...ctx.inputs },
    };

    const subInstanceId = await ctx.startSubProcess(defId, triggerContext);

    this.logger.log(`子流程 ${defId} 已启动，实例 ${subInstanceId}（父实例 ${ctx.instance.id}）`);

    return {
      output: { subInstanceId, subProcessDefId: defId },
    };
  }
}
