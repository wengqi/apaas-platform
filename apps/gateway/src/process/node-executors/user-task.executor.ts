/**
 * UserTaskExecutor — 人工任务/审批节点。
 *
 * 定位：流程暂停，等待人工处理（审批/填报），是流程引擎与终端用户的交互点。
 * 配置项（node.data，UserTaskConfig）：assignee / candidateGroups / taskName /
 *   approvalMode（R1.3: single|countersign|or_sign|sequential）/ approveUsers /
 *   pageId（审批页面绑定）/ dueDate。
 * 执行逻辑：按审批模式创建 ProcessTask（PENDING）→ 返回 wait=true，引擎置实例为
 *   WAITING_USER_TASK。用户审批后由 ProcessEngine.completeTask 聚合决策并推进令牌。
 *
 * R1.3 审批模式语义（决策聚合在 completeTask）：
 * - single（默认）：单人任务，首个决策即节点决策
 * - countersign 会签：一次生成 approveUsers 全部并行任务，全部 approved 才通过，
 *   任一 rejected 即节点驳回
 * - or_sign 或签：一次生成全部并行任务，任一人决策即终结其余任务
 * - sequential 依次：仅生成第 sequentialIndex 个用户的任务，approved 后由
 *   completeTask 推进下标并重新进入本执行器生成下一个任务
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';

/** 会签/或签/依次模式下允许的最大并行审批人数（防误配超大审批组）。 */
const MAX_MULTI_APPROVERS = 50;

@Injectable()
export class UserTaskExecutor implements NodeExecutor {
  private readonly logger = new Logger(UserTaskExecutor.name);
  readonly type = 'user_task';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const taskName =
      (data['taskName'] as string) ??
      (data['task_name'] as string) ??
      ctx.node.data.title ??
      '人工任务';
    const assignee =
      (data['assignee'] as string | undefined) ?? (ctx.inputs['assignee'] as string | undefined);
    const candidateGroups =
      (data['candidateGroups'] as string[] | undefined) ??
      (data['candidate_groups'] as string[] | undefined) ??
      [];
    const approvalMode = (data['approvalMode'] as string | undefined) ?? 'single';
    const approveUsers = (data['approveUsers'] as string[] | undefined) ?? [];
    const pageId = typeof data['pageId'] === 'string' ? (data['pageId'] as string) : undefined;

    // 变量引用解析：approveUsers 项支持 '${...}' 模板（后续批次接入变量求值，先做直通）
    const resolvedUsers = approveUsers.filter((u) => typeof u === 'string' && u.length > 0);
    if (
      (approvalMode === 'countersign' ||
        approvalMode === 'or_sign' ||
        approvalMode === 'sequential') &&
      resolvedUsers.length === 0
    ) {
      throw new Error(`节点 ${ctx.node.id} 配置了审批模式 ${approvalMode}，但 approveUsers 为空`);
    }
    if (resolvedUsers.length > MAX_MULTI_APPROVERS) {
      throw new Error(
        `节点 ${ctx.node.id} 审批人数 ${resolvedUsers.length} 超过上限 ${MAX_MULTI_APPROVERS}`,
      );
    }

    // 依次审批：只生成当前进度位用户的任务（进度存节点变量 sequentialIndex）
    let targetUsers: string[];
    if (approvalMode === 'sequential') {
      const idx = this.readSequentialIndex(ctx.variables, ctx.node.id);
      if (idx >= resolvedUsers.length) {
        // 进度越界（理论上 completeTask 会在最后一人后直接推进，不会走到这）
        throw new Error(`节点 ${ctx.node.id} 依次审批进度越界：index=${idx}`);
      }
      targetUsers = [resolvedUsers[idx]!];
    } else if (approvalMode === 'countersign' || approvalMode === 'or_sign') {
      targetUsers = resolvedUsers;
    } else {
      targetUsers = assignee ? [assignee] : [];
    }

    if (targetUsers.length === 0 && candidateGroups.length === 0) {
      throw new Error(
        `节点 ${ctx.node.id} 人工任务无受理人：请配置 assignee/candidateGroups/approveUsers`,
      );
    }

    await prisma.processTask.createMany({
      data: targetUsers.map((uid) => ({
        tenantId: ctx.tenantId,
        instanceId: ctx.instance.id,
        nodeExecutionId: ctx.nodeExecutionId,
        nodeId: ctx.node.id,
        taskName,
        assignee: uid,
        candidateGroups,
        status: 'PENDING' as const,
      })),
    });

    this.logger.log(
      `创建人工任务 ×${targetUsers.length}（节点 ${ctx.node.id}，模式=${approvalMode}），流程实例 ${ctx.instance.id}`,
    );

    // R1.3：pageId 等节点配置在 getTask 时从 WorkflowSchema 读取（无需落到任务行）
    void pageId;

    return {
      output: { taskId: null, assignees: targetUsers, approvalMode },
      wait: true,
    };
  }

  /** 读取依次审批进度（存于变量作用域 [nodeId].sequentialIndex）。 */
  private readSequentialIndex(variables: Record<string, unknown>, nodeId: string): number {
    const nodeScope = variables[nodeId] as Record<string, unknown> | undefined;
    const idx = nodeScope?.['sequentialIndex'];
    return typeof idx === 'number' ? idx : 0;
  }
}
