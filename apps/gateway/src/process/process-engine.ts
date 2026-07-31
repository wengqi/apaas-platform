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

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class ProcessEngine {
  private readonly logger = new Logger(ProcessEngine.name);

  constructor(private readonly registry: NodeExecutorRegistry) {}

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
    const instance = await prisma.processInstance.create({
      data: {
        tenantId,
        processDefId: def.id,
        triggerContext: triggerContext as Prisma.InputJsonValue,
        variables: {} as Prisma.InputJsonValue,
        status: 'RUNNING',
        activeNodeIds: [startNode.id],
      },
      include: { processDef: true },
    });

    this.logger.log(
      `启动流程实例 ${instance.id}（流程 ${def.apiName} v${def.version}），start 节点 ${startNode.id}`,
    );

    // 推进令牌执行
    await this.executeNextNode(instance.id);
    return instance.id;
  }

  // ===========================================================================
  // token 流推进
  // ===========================================================================

  /**
   * 执行下一个节点（token 流推进）。
   *
   * 循环处理当前所有活跃令牌，每个令牌执行对应节点并推进，直到：
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

    // 处理活跃令牌，逐个推进直到稳定
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

    // 标记关联 NodeExecution 完成
    await prisma.$transaction([
      prisma.processInstance.update({
        where: { id: task.instance.id },
        data: {
          variables: variables as Prisma.InputJsonValue,
          status: 'RUNNING',
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

    // 继续推进令牌
    await this.executeNextNode(task.instance.id);
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
}
