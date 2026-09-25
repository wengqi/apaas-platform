/**
 * SubProcessExecutor — 子流程调用节点。
 *
 * 定位：调用另一个已发布流程，实现流程复用与分层。
 * 配置项（node.data）：subProcessKey（子流程 apiName）/ subProcessDefId（直接指定流程定义ID）/
 *   sync（是否同步等待，默认 true）/ inputMapping（输入参数映射）。
 * 执行逻辑：通过 ctx.startSubProcess 启动子流程实例 →
 *   同步模式（默认）：triggerContext 记录父实例链接（_parent），本节点 wait=true 暂停；
 *     子实例完成/失败时由引擎 resumeParentAfterSubProcess 恢复父节点
 *     （父实例锁串行化保证恢复发生在 wait 注册之后，无竞态）。
 *   异步模式（sync=false）：启动后立即继续，子流程实例 ID 写入输出供后续节点引用。
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
    const sync = data['sync'] !== false;
    const triggerContext: Record<string, unknown> = {
      triggeredBy: 'SUB_PROCESS',
      inputs: { ...globalVars, ...ctx.inputs },
    };

    // 同步等待：记录父实例链接，子实例完成/失败时由引擎恢复本节点
    if (sync) {
      triggerContext['_parent'] = { instanceId: ctx.instance.id, nodeId: ctx.node.id };
    }

    const subInstanceId = await ctx.startSubProcess(defId, triggerContext);

    this.logger.log(
      `子流程 ${defId} 已启动，实例 ${subInstanceId}（父实例 ${ctx.instance.id}，sync=${sync}）`,
    );

    return {
      output: { subInstanceId, subProcessDefId: defId, sync },
      ...(sync ? { wait: true } : {}),
    };
  }
}
