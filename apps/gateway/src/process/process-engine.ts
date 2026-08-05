/**
 * 流程执行引擎 — 状态机执行内核（token 流）。
 *
 * 核心模型：
 * - 流程实例持有若干活跃令牌，每个令牌位于某节点（activeNodeIds）。
 * - 节点执行后产出令牌流向下游（NodeExecutionResult.nextNodeIds）。
 * - 每次 token 推进更新 activeNodeIds + 写 NodeExecution 记录，崩溃可从持久化状态恢复。
 *
 * 执行流程：
 *   startProcess → 创建实例 + NodeExecution → executeNextNode 循环推进令牌
 *   遇到 UserTask → wait=true，实例置 WAITING_USER_TASK，暂停
 *   completeTask → 写入决策 → 标记 NodeExecution COMPLETED → 继续推进令牌
 *   到达 End 节点 → 令牌终止；无活跃令牌则实例 COMPLETED
 */

import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { prisma, Prisma } from '@apaas/db';
import type {
  WorkflowSchema,
  WorkflowNode,
  WorkflowEdge,
} from '@apaas/shared';
import { NodeExecutorRegistry } from './node-executor.registry.js';
import {
  resolveInputs,
  writeNodeOutput,
} from './process-utils.js';
import type { ExecutionContext, InstanceRow } from './types.js';
import { PROCESS_QUEUE, DELAY_QUEUE } from '../queue/queue.constants.js';
import { InAppMessageService } from '../notification/in-app-message.service.js';

@Injectable()
export class ProcessEngine {
  private readonly logger = new Logger(ProcessEngine.name);

  constructor(
    private readonly registry: NodeExecutorRegistry,
    private readonly inAppMessageService: InAppMessageService,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
    @Inject(DELAY_QUEUE) private readonly delayQueue: Queue,
  ) {}

  // ===========================================================================
  // 启动流程实例
  // ===========================================================================

  /**
   * 启动流程实例。
   *
   * @param tenantId 租户
   * @param processDefId 流程定义 ID（须已发布）
   * @param triggerContext 触发上下文（触发来源 / 输入参数）
   * @returns 流程实例 ID
   */
  async startProcess(
    tenantId: string,
    processDefId: string,
    triggerContext: Record<string, unknown>,
  ): Promise<string> {
    // 加载已发布的流程定义
    const def = await prisma.processDef.findFirst({
      where: { id: processDefId, tenantId, status: 'PUBLISHED' },
    });
    if (!def) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '流程未发布，无法启动（需先发布）',
      });
    }

    const schema = def.workflowSchema as unknown as WorkflowSchema;
    const startNode = this.findStartNode(schema);
    if (!startNode) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '流程 Schema 缺少 start 节点',
      });
    }

    // 创建流程实例，活跃令牌置于 start 节点
    // 将 triggerContext 中的输入变量展开到 variables 顶层，供条件分支等节点直接引用
    const inputs = (triggerContext['inputs'] as Record<string, unknown> | undefined) ?? {};
    const initialVariables: Record<string, unknown> = { ...triggerContext, ...inputs };
    const instance = await prisma.processInstance.create({
      data: {
        tenantId,
        processDefId: def.id,
        triggerContext: triggerContext as Prisma.InputJsonValue,
        variables: initialVariables as Prisma.InputJsonValue,
        status: 'RUNNING',
        activeNodeIds: [startNode.id],
      },
      include: { processDef: true },
    });

    this.logger.log(
      `启动流程实例 ${instance.id}（流程 ${def.apiName} v${def.version}），start 节点 ${startNode.id}`,
    );

    // 异步入队：由 BullMQ Worker 消费推进令牌
    await this.processQueue.add('execute', { instanceId: instance.id });
    return instance.id;
  }

  /**
   * 按 processDefId 启动流程实例（用于定时触发器 — 无 tenantId 上下文）。
   * 先加载流程定义获取 tenantId，再委托 startProcess。
   */
  async startProcessByDefId(
    processDefId: string,
    triggerContext: Record<string, unknown>,
  ): Promise<string> {
    const def = await prisma.processDef.findFirst({
      where: { id: processDefId, status: 'PUBLISHED' },
      select: { id: true, tenantId: true, apiName: true },
    });
    if (!def) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `流程 ${processDefId} 不存在或未发布`,
      });
    }

    this.logger.log(`定时触发流程 ${def.apiName}(${processDefId})`);

    return this.startProcess(def.tenantId, def.id, triggerContext);
  }

  // ===========================================================================
  // token 流推进
  // ===========================================================================

  /**
   * 执行下一个节点（token 流推进）。
   *
   * 每次调用处理一个活跃令牌的推进，然后重新入队继续下一轮。
   * 这样每个节点的执行都在独立的 BullMQ job 中，实现异步解耦 + 崩溃恢复。
   *
   * 终止条件：
   * - 无活跃令牌（全部到达 End，实例 COMPLETED）
   * - 某节点返回 wait（实例 WAITING_USER_TASK）
   * - 节点执行失败（实例 FAILED）
   */
  async executeNextNode(instanceId: string): Promise<void> {
    // 重新加载实例（确保拿到最新状态）
    let instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      include: { processDef: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    if (instance.status !== 'RUNNING') {
      this.logger.debug(
        `实例 ${instanceId} 状态为 ${instance.status}，跳过执行`,
      );
      return;
    }

    const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const variables = (instance.variables as Record<string, unknown>) ?? {};

    // 处理活跃令牌，逐个推进
    while (instance.activeNodeIds.length > 0 && instance.status === 'RUNNING') {
      const nodeId = instance.activeNodeIds[0]!;
      const node = this.findNode(schema, nodeId);
      if (!node) {
        // 令牌指向不存在的节点，移除该令牌
        this.logger.warn(`实例 ${instanceId} 的活跃节点 ${nodeId} 不存在于 Schema，移除令牌`);
        instance = await this.removeActiveNode(instance, nodeId);
        continue;
      }

      // 执行单个节点
      const { result, completed } = await this.executeNode(instance, node, schema, variables);

      if (!completed) {
        // 节点暂停（wait=true），实例已置为 WAITING_USER_TASK，停止推进
        return;
      }

      // 计算下一节点
      const nextNodeIds = this.resolveNextNodes(node, result, schema);
      // 移除当前令牌，添加下游令牌
      instance = await this.advanceTokens(instance, nodeId, nextNodeIds, variables);
    }

    // 无活跃令牌 → 实例完成
    if (instance.activeNodeIds.length === 0 && instance.status === 'RUNNING') {
      await prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      this.logger.log(`流程实例 ${instanceId} 已完成`);
    }
  }

  /**
   * 执行单个节点。
   *
   * @returns { result, completed } —— result 为执行器输出；completed 表示是否已执行完毕（false = 暂停等待）
   */
  async executeNode(
    instance: InstanceRow,
    node: WorkflowNode,
    schema: WorkflowSchema,
    variables: Record<string, unknown>,
  ): Promise<{ result: import('./types.js').NodeExecutionResult; completed: boolean }> {
    const executor = this.registry.get(node.type);
    const outgoingEdges = this.getOutgoingEdges(schema, node.id);

    // 创建 NodeExecution 记录（RUNNING）
    const nodeExecution = await prisma.nodeExecution.create({
      data: {
        instanceId: instance.id,
        nodeId: node.id,
        nodeType: node.type,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // 解析四态输入值
    const inputs = resolveInputs(node.data.inputsValues, variables);

    const ctx: ExecutionContext = {
      instance,
      node,
      nodeExecutionId: nodeExecution.id,
      outgoingEdges,
      inputs,
      variables,
      tenantId: instance.tenantId,
      appId: instance.processDef.appId,
      startSubProcess: (defId, trigCtx) =>
        this.startProcess(instance.tenantId, defId, trigCtx),
      scheduleDelay: (instanceId, nodeId, delayMs) =>
        this.scheduleDelay(instanceId, nodeId, delayMs),
    };

    try {
      const result = await executor.execute(ctx);

      // 写入节点输出到变量作用域
      writeNodeOutput(variables, node.id, result.output);

      // 持久化变量快照 + NodeExecution 完成
      await prisma.$transaction([
        prisma.processInstance.update({
          where: { id: instance.id },
          data: { variables: variables as Prisma.InputJsonValue },
        }),
        prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: {
            status: result.wait ? 'WAITING' : 'COMPLETED',
            output: (result.output ?? null) as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        }),
      ]);

      // 若节点暂停（人工任务），置实例为 WAITING_USER_TASK
      if (result.wait) {
        await prisma.processInstance.update({
          where: { id: instance.id },
          data: { status: 'WAITING_USER_TASK' },
        });
        this.logger.log(
          `实例 ${instance.id} 在节点 ${node.id} 暂停，等待人工任务`,
        );
        return { result, completed: false };
      }

      return { result, completed: true };
    } catch (err) {
      // 节点执行失败，标记 FAILED
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `实例 ${instance.id} 节点 ${node.id} 执行失败: ${errorMsg}`,
      );
      await prisma.$transaction([
        prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: {
            status: 'FAILED',
            error: errorMsg,
            finishedAt: new Date(),
          },
        }),
        prisma.processInstance.update({
          where: { id: instance.id },
          data: { status: 'FAILED', error: errorMsg },
        }),
      ]);
      throw err;
    }
  }

  // ===========================================================================
  // 完成人工任务（审批）
  // ===========================================================================

  /**
   * 完成人工任务。
   *
   * @param taskId 任务 ID
   * @param userId 处理人 ID
   * @param decision 审批决策（approved/rejected）
   * @param comment 审批意见
   * @param formData 表单数据
   */
  async completeTask(
    taskId: string,
    userId: string,
    decision: string,
    comment: string | undefined,
    formData: Record<string, unknown> | undefined,
  ): Promise<void> {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId },
      include: { instance: { include: { processDef: true } } },
    });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: '任务已完成或已取消',
      });
    }

    const decisionUpper = decision.toUpperCase();
    const taskStatus =
      decisionUpper === 'APPROVED' ? 'APPROVED' :
      decisionUpper === 'REJECTED' ? 'REJECTED' : 'DELEGATED';

    // 更新任务
    await prisma.processTask.update({
      where: { id: taskId },
      data: {
        status: taskStatus,
        decision: decisionUpper,
        comment,
        formdata: (formData ?? null) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    // 写入任务决策到节点输出变量，供下游节点引用
    const variables =
      (task.instance.variables as Record<string, unknown>) ?? {};
    writeNodeOutput(variables, task.nodeId, {
      decision: decisionUpper,
      comment,
      formData,
      assignee: userId,
    });

    const schema = task.instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const currentActive = (task.instance.activeNodeIds as string[]) ?? [];

    // 驳回逻辑：如果 decision=rejected 且节点配置了 rejectToNodeId，
    // 则跳过正常下游节点，直接将 token 跳回 rejectToNodeId
    let nextNodeIds: string[];
    if (decisionUpper === 'REJECTED') {
      // 从节点 data 中读取 rejectToNodeId 配置
      const currentNode = schema.nodes?.find((n) => n.id === task.nodeId);
      const rejectToNodeId = currentNode?.data?.rejectToNodeId as string | undefined;
      if (rejectToNodeId) {
        // 驳回：跳回指定节点
        nextNodeIds = [rejectToNodeId];
        this.logger.log(
          `任务 ${taskId} 驳回，实例 ${task.instance.id} 跳回节点 ${rejectToNodeId}`,
        );
      } else {
        // 未配置驳回目标，按正常流程走（reject 作为条件供下游 condition 判断）
        const outgoing = this.getOutgoingEdges(schema, task.nodeId);
        nextNodeIds = outgoing.map((e) => e.targetNodeID);
      }
    } else {
      // 正常推进：移除当前节点，添加下游节点
      const outgoing = this.getOutgoingEdges(schema, task.nodeId);
      nextNodeIds = outgoing.map((e) => e.targetNodeID);
    }

    const updatedActive = [
      ...new Set([
      ...currentActive.filter((id) => id !== task.nodeId),
      ...nextNodeIds,
      ]),
    ];

    // 标记关联 NodeExecution 完成 + 更新实例状态和活跃节点
    await prisma.$transaction([
      prisma.processInstance.update({
        where: { id: task.instance.id },
        data: {
          variables: variables as Prisma.InputJsonValue,
          status: 'RUNNING',
          activeNodeIds: updatedActive,
        },
      }),
      prisma.nodeExecution.update({
        where: { id: task.nodeExecutionId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      }),
    ]);

    this.logger.log(
      `任务 ${taskId} 已完成（${decisionUpper}），实例 ${task.instance.id} 恢复执行`,
    );

    // --- 抄送逻辑 ---
    await this.sendCcNotification(
      schema,
      task.nodeId,
      task.instance.tenantId,
      task.instance.processDef.appId,
      task.instance.processDef.name,
      task.taskName,
      decisionUpper,
      comment,
    );

    // 异步入队：由 BullMQ Worker 消费推进令牌
    await this.processQueue.add('execute', { instanceId: task.instance.id });
  }

  // ===========================================================================
  // 取消流程
  // ===========================================================================

  /**
   * 取消/终止流程实例。
   * 取消所有待办任务，实例置为 TERMINATED。
   */
  async cancelProcess(instanceId: string): Promise<void> {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');

    await prisma.$transaction([
      // 取消所有待办任务
      prisma.processTask.updateMany({
        where: { instanceId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      }),
      prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'TERMINATED', finishedAt: new Date() },
      }),
    ]);

    this.logger.log(`流程实例 ${instanceId} 已取消`);
  }

  // ===========================================================================
  // 延时节点恢复
  // ===========================================================================

  /**
   * 恢复延时节点 — BullMQ delayed job 到时后调用。
   *
   * 将延时节点的 NodeExecution 标记为 COMPLETED，
   * 然后重新入队推进令牌（此时节点已执行完毕，引擎会计算下游节点并推进）。
   *
   * @param instanceId 流程实例 ID
   * @param nodeId 延时节点 ID
   */
  async resumeDelayedNode(instanceId: string, nodeId: string): Promise<void> {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      include: { processDef: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    // 延时节点恢复时，实例状态应为 WAITING_USER_TASK（delay executor 返回 wait: true 导致）
    // 也可能是 RUNNING（其他场景），两者都允许恢复
    if (instance.status !== 'RUNNING' && instance.status !== 'WAITING_USER_TASK') {
      this.logger.debug(
        `实例 ${instanceId} 状态为 ${instance.status}，延时恢复跳过`,
      );
      return;
    }

    // 标记延时节点的 NodeExecution 为 COMPLETED
    await prisma.nodeExecution.updateMany({
      where: { instanceId, nodeId, status: 'WAITING' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });

    // 恢复实例状态为 RUNNING（从 WAITING_USER_TASK 恢复）
    if (instance.status === 'WAITING_USER_TASK') {
      await prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'RUNNING' },
      });
    }

    // 推进令牌：移除当前延时节点的令牌，添加下游节点令牌
    const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const node = this.findNode(schema, nodeId);
    const outgoing = this.getOutgoingEdges(schema, nodeId);
    const nextNodeIds = outgoing.map((e) => e.targetNodeID);

    await this.advanceTokens(instance, nodeId, nextNodeIds, (instance.variables as Record<string, unknown>) ?? {});

    this.logger.log(
      `实例 ${instanceId} 延时节点 ${nodeId} 已恢复，令牌推进到下游: ${nextNodeIds.join(', ')}`,
    );

    // 重新入队推进下一节点
    await this.processQueue.add('execute', { instanceId });
  }

  /**
   * 调度延时恢复 — 供 DelayExecutor 调用。
   *
   * 将实例置为 WAITING 状态（暂停令牌推进），并添加 BullMQ delayed job。
   *
   * @param instanceId 流程实例 ID
   * @param nodeId 延时节点 ID
   * @param delayMs 延时毫秒数
   */
  async scheduleDelay(
    instanceId: string,
    nodeId: string,
    delayMs: number,
  ): Promise<void> {
    // 标记 NodeExecution 为 WAITING
    await prisma.nodeExecution.updateMany({
      where: { instanceId, nodeId, status: 'RUNNING' },
      data: { status: 'WAITING' },
    });

    // 添加 delayed job
    await this.delayQueue.add(
      'resume',
      { instanceId, nodeId },
      { delay: delayMs },
    );

    this.logger.log(
      `实例 ${instanceId} 节点 ${nodeId} 延时 ${delayMs}ms，已调度 BullMQ delayed job`,
    );
  }

  // ===========================================================================
  // 辅助：Schema 导航
  // ===========================================================================

  /** 查找 start 节点。 */
  private findStartNode(schema: WorkflowSchema): WorkflowNode | undefined {
    return schema.nodes.find((n) => n.type === 'start');
  }

  /** 按 ID 查找节点。 */
  private findNode(schema: WorkflowSchema, nodeId: string): WorkflowNode | undefined {
    return schema.nodes.find((n) => n.id === nodeId);
  }

  /** 获取节点的出边列表。 */
  private getOutgoingEdges(schema: WorkflowSchema, nodeId: string): WorkflowEdge[] {
    return schema.edges.filter((e) => e.sourceNodeID === nodeId);
  }

  /**
   * 计算节点的下一节点 ID 列表。
   * - 执行器显式返回 nextNodeIds：使用之（条件/并行节点）
   * - 否则：取节点所有出边的 targetNodeID
   * - 空数组表示令牌终止（End 节点）
   */
  private resolveNextNodes(
    node: WorkflowNode,
    result: import('./types.js').NodeExecutionResult,
    schema: WorkflowSchema,
  ): string[] {
    if (result.nextNodeIds) {
      return result.nextNodeIds;
    }
    const outgoing = this.getOutgoingEdges(schema, node.id);
    return outgoing.map((e) => e.targetNodeID);
  }

  /**
   * 推进令牌：移除当前节点令牌，添加下游令牌。
   */
  private async advanceTokens(
    instance: InstanceRow,
    currentNodeId: string,
    nextNodeIds: string[],
    variables: Record<string, unknown>,
  ): Promise<InstanceRow> {
    // 移除当前令牌
    const remaining = instance.activeNodeIds.filter((id) => id !== currentNodeId);
    // 添加下游令牌（去重）
    const updated = [...new Set([...remaining, ...nextNodeIds])];

    const refreshed = await prisma.processInstance.update({
      where: { id: instance.id },
      data: {
        activeNodeIds: updated,
        variables: variables as Prisma.InputJsonValue,
      },
      include: { processDef: true },
    });
    return refreshed;
  }

  /** 从活跃令牌列表移除指定节点。 */
  private async removeActiveNode(
    instance: InstanceRow,
    nodeId: string,
  ): Promise<InstanceRow> {
    const updated = instance.activeNodeIds.filter((id) => id !== nodeId);
    return prisma.processInstance.update({
      where: { id: instance.id },
      data: { activeNodeIds: updated },
      include: { processDef: true },
    });
  }

  // ===========================================================================
  // 辅助：抄送通知
  // ===========================================================================

  /**
   * 根据抄送人类型解析实际用户 ID 列表。
   * - USER: 直接返回
   * - ROLE: 查 UserRole 连接表展开
   * - ORG: 查 OrgMember 连接表展开
   */
  private async resolveCcRecipients(
    tenantId: string,
    ccAssigneeType: string,
    ccRecipients: string[],
  ): Promise<string[]> {
    if (ccRecipients.length === 0) return [];

    if (ccAssigneeType === 'USER') {
      return ccRecipients;
    }

    if (ccAssigneeType === 'ROLE') {
      const userRoles = await prisma.userRole.findMany({
        where: { roleId: { in: ccRecipients } },
        select: { userId: true },
      });
      return [...new Set(userRoles.map((r) => r.userId))];
    }

    if (ccAssigneeType === 'ORG') {
      const members = await prisma.orgMember.findMany({
        where: { orgId: { in: ccRecipients } },
        select: { userId: true },
      });
      return [...new Set(members.map((m) => m.userId))];
    }

    return [];
  }

  /**
   * 发送抄送通知（审批完成后触发）。
   *
   * 从节点 data 读取抄送配置，按触发时机判断是否发送站内信。
   * 通知发送失败不阻塞流程执行（仅记日志）。
   */
  private async sendCcNotification(
    schema: WorkflowSchema,
    nodeId: string,
    tenantId: string,
    appId: string,
    processName: string,
    taskName: string,
    decisionUpper: string,
    comment: string | undefined,
  ): Promise<void> {
    try {
      const node = schema.nodes?.find((n) => n.id === nodeId);
      const nodeData = node?.data ?? {};
      const ccEnabled = nodeData.ccEnabled as boolean;
      if (!ccEnabled) return;

      const ccTrigger = (nodeData.ccTrigger as string) ?? 'onApprove';
      const shouldNotify =
        ccTrigger === 'onComplete' ||
        (ccTrigger === 'onApprove' && decisionUpper === 'APPROVED') ||
        (ccTrigger === 'onReject' && decisionUpper === 'REJECTED');
      if (!shouldNotify) return;

      const ccType = (nodeData.ccAssigneeType as string) ?? 'USER';
      const ccList = (nodeData.ccRecipients as string[]) ?? [];
      const userIds = await this.resolveCcRecipients(tenantId, ccType, ccList);
      if (userIds.length === 0) return;

      const decisionText = decisionUpper === 'APPROVED' ? '通过' : '驳回';
      await this.inAppMessageService.create({
        tenantId,
        appId,
        userIds,
        title: '审批抄送通知',
        body: `流程「${processName}」的审批节点「${taskName}」已由审批人${decisionText}。${comment ? '备注：' + comment : ''}`,
      });

      this.logger.log(
        `抄送通知已发送：实例节点 ${nodeId}，收件人 ${userIds.length} 人`,
      );
    } catch (err) {
      // 通知发送失败不阻塞流程
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`抄送通知发送失败（节点 ${nodeId}）: ${errorMsg}`);
    }
  }
}
