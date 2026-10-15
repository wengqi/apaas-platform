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
    const assigneeType = String(data['assigneeType'] ?? '').toUpperCase();
    // INITIATOR（发起人审批，专题 R1-A1）：受理人=实例发起人。发起人由启动路径注入
    // triggerContext（A3：MANUAL 兜底 callerUserId；记录触发=创建人；定时/API 需显式传入），
    // 缺失时报清晰错误而非静默创建无主任务（那会复现 #12 的流程挂起）。
    let assignee: string | undefined =
      (data['assignee'] as string | undefined) ?? (ctx.inputs['assignee'] as string | undefined);
    if (assigneeType === 'INITIATOR') {
      const triggerCtx = (ctx.instance.triggerContext ?? {}) as Record<string, unknown>;
      const initiator = triggerCtx['triggeredByUser'];
      if (typeof initiator !== 'string' || initiator.length === 0) {
        throw new Error(
          `节点 ${ctx.node.id} 配置了发起人审批（INITIATOR），但实例无发起人（triggerContext.triggeredByUser 缺失）：定时/API 触发需显式传入发起人`,
        );
      }
      assignee = initiator;
    }
    const candidateGroups =
      (data['candidateGroups'] as string[] | undefined) ??
      (data['candidate_groups'] as string[] | undefined) ??
      [];
    // ORG（组织审批，专题 R2-A2）：候选组=组织 ID（任务中心按「我的角色 ∪ 我的组织」匹配），
    // 执行器校验组织存在且有成员——防"无主任务无人可见"的静默挂起（#12 同教训）。
    if (assigneeType === 'ORG') {
      const orgId = candidateGroups[0] ?? assignee;
      if (!orgId) {
        throw new Error(`节点 ${ctx.node.id} 配置了组织审批（ORG），但未选择组织`);
      }
      const memberCount = await prisma.orgMember.count({
        where: { orgId, org: { tenantId: ctx.tenantId } },
      });
      if (memberCount === 0) {
        throw new Error(
          `节点 ${ctx.node.id} 组织审批的组织（${orgId}）不存在或无成员，请到权限管理检查组织与成员配置`,
        );
      }
    }
    // FORM_FIELD（记录字段动态审批人，专题 R2-A2）：assignee=触发记录字段 apiName，
    // 运行时取该字段值（须为用户 ID 字符串）作为受理人；仅记录触发可用。
    if (assigneeType === 'FORM_FIELD') {
      const field = assignee;
      if (!field) {
        throw new Error(`节点 ${ctx.node.id} 配置了记录字段审批人（FORM_FIELD），但未填写字段名`);
      }
      const triggerCtx = (ctx.instance.triggerContext ?? {}) as Record<string, unknown>;
      const record = triggerCtx['record'] as Record<string, unknown> | undefined;
      if (!record) {
        throw new Error(
          `节点 ${ctx.node.id} 配置了记录字段审批人（FORM_FIELD），但实例无记录触发上下文：仅记录触发（创建/更新）可用，定时/API/手动启动不支持`,
        );
      }
      const value = record[field];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `节点 ${ctx.node.id} 记录字段审批人：触发记录中字段 ${field} 不存在或不是有效用户 ID`,
        );
      }
      // OCR 评审补强（2026-10-15）：值须为本租户真实用户——否则任务建给不存在的用户，
      // 复现「任务挂起无人可见」（#12 同教训，与 ORG 分支的成员数校验对称）
      const reviewer = await prisma.user.findFirst({
        where: { id: value, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!reviewer) {
        throw new Error(
          `节点 ${ctx.node.id} 记录字段审批人：字段 ${field} 的值（${value}）不是本租户内的有效用户，请检查触发记录数据`,
        );
      }
      assignee = value;
    }
    // QA 实测（2026-10-03）：面板写大写枚举、seed/引擎写小写——归一化统一
    const approvalMode = ((data['approvalMode'] as string | undefined) ?? 'single').toLowerCase();
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

    // 仅角色（指定角色模式）：创建一条无主任务行（assignee=null），
    // 由任务中心按 candidateGroups（角色 ID）匹配角色成员展示/办理
    // （A 旅程实测缺陷 #12：此前仅角色时 createMany 空数组——流程挂起但永无任务）。
    const taskRows =
      targetUsers.length > 0
        ? targetUsers.map((uid) => ({
            tenantId: ctx.tenantId,
            instanceId: ctx.instance.id,
            nodeExecutionId: ctx.nodeExecutionId,
            nodeId: ctx.node.id,
            taskName,
            assignee: uid,
            candidateGroups,
            status: 'PENDING' as const,
          }))
        : [
            {
              tenantId: ctx.tenantId,
              instanceId: ctx.instance.id,
              nodeExecutionId: ctx.nodeExecutionId,
              nodeId: ctx.node.id,
              taskName,
              assignee: null,
              candidateGroups,
              status: 'PENDING' as const,
            },
          ];

    await prisma.processTask.createMany({ data: taskRows });

    this.logger.log(
      `创建人工任务 ×${taskRows.length}（节点 ${ctx.node.id}，模式=${approvalMode}，角色数=${candidateGroups.length}），流程实例 ${ctx.instance.id}`,
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
