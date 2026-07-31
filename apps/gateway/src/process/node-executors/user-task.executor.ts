/**
 * UserTaskExecutor — 人工任务/审批节点。
 *
 * 定位：流程暂停，等待人工处理（审批/填报），是流程引擎与终端用户的交互点。
 * 配置项（node.data）：assignee（受理人ID）/ candidateGroups（候选角色ID数组）/
 *   taskName（任务名称）/ formKey（表单 key）/ dueDate（截止时间）。
 * 执行逻辑：创建 ProcessTask 记录（PENDING）→ 返回 wait=true，引擎置实例为 WAITING_USER_TASK。
 *   用户审批后由 ProcessEngine.completeTask 写入决策并恢复令牌。
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

@Injectable()
export class UserTaskExecutor implements NodeExecutor {
  private readonly logger = new Logger(UserTaskExecutor.name);
  readonly type = 'user_task';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const taskName =
      (data['taskName'] as string) ?? (data['task_name'] as string) ?? ctx.node.data.title ?? '人工任务';
    const assignee = (data['assignee'] as string | undefined) ??
      (ctx.inputs['assignee'] as string | undefined);
    const candidateGroups =
      (data['candidateGroups'] as string[] | undefined) ??
      (data['candidate_groups'] as string[] | undefined) ??
      [];

    const task = await prisma.processTask.create({
      data: {
        tenantId: ctx.tenantId,
        instanceId: ctx.instance.id,
        nodeExecutionId: ctx.nodeExecutionId,
        nodeId: ctx.node.id,
        taskName,
        assignee,
        candidateGroups,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `创建人工任务 ${task.id}（节点 ${ctx.node.id}），受理人=${assignee ?? '未指定'}，流程实例 ${ctx.instance.id}`,
    );

    return {
      output: { taskId: task.id, assignee },
      wait: true,
    };
  }
}
