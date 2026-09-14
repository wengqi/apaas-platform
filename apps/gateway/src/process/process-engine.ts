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
import { prisma, Prisma, runWithTenant } from '@apaas/db';
import type { WorkflowSchema, WorkflowNode, WorkflowEdge } from '@apaas/shared';
import { NodeExecutorRegistry } from './node-executor.registry.js';
import { resolveInputs, writeNodeOutput, evaluateCondition } from './process-utils.js';
import type { ExecutionContext, InstanceRow } from './types.js';
import { PROCESS_QUEUE, DELAY_QUEUE } from '../queue/queue.constants.js';
import { InAppMessageService } from '../notification/in-app-message.service.js';

/**
 * 递归在 blocks 数组中查找节点（用于查找嵌套在条件分支内的 block 容器等）。
 */
function findNodeInBlocks(blocks: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
  for (const block of blocks) {
    if (block.id === nodeId) return block;
    if (block.blocks) {
      const found = findNodeInBlocks(block.blocks, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}

@Injectable()
export class ProcessEngine {
  private readonly logger = new Logger(ProcessEngine.name);

  /** 单实例最大节点执行次数（循环预算）— 超过视为循环 Schema，实例置 FAILED。 */
  private static readonly MAX_NODE_EXECUTIONS = 1000;

  /**
   * 进程内单实例串行锁：同一实例的令牌推进/任务完成/延时恢复互斥执行。
   *
   * 背景：worker concurrency=5，同一实例可能同时有多个 job（启动/审批完成/延时恢复），
   * 并发读写 activeNodeIds 会丢失令牌导致实例卡死。此 Map 以 instanceId 为 key 串行化
   * 同进程内的所有实例操作。多进程水平扩展时需升级为 Redis 分布式锁。
   */
  private readonly instanceLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly registry: NodeExecutorRegistry,
    private readonly inAppMessageService: InAppMessageService,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
    @Inject(DELAY_QUEUE) private readonly delayQueue: Queue,
  ) {}

  /**
   * 在实例级互斥锁内执行 fn。
   * 同一实例的操作按调用顺序串行；不同实例互不阻塞。
   */
  private async withInstanceLock<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.instanceLocks.get(instanceId) ?? Promise.resolve();
    const run = prev
      .catch(() => {
        /* 前序操作失败不阻断后续排队 */
      })
      .then(fn);
    this.instanceLocks.set(instanceId, run);
    try {
      return await run;
    } finally {
      // 仅当仍是队尾时清理，避免误删后续排队的 promise
      if (this.instanceLocks.get(instanceId) === run) {
        this.instanceLocks.delete(instanceId);
      }
    }
  }

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
   * 先加载流程定义获取 tenantId（此查询在 ALS 上下文外 — 安全，processDefId 全局唯一），
   * 再通过 runWithTenant 设置 ALS 上下文，委托 startProcess。
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

    return runWithTenant(def.tenantId, () =>
      this.startProcess(def.tenantId, def.id, triggerContext),
    );
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
   *
   * 注：此方法由 BullMQ Worker 调用，tenantId 从 job data 继承
   * （job 由已验证的 HTTP 请求入队，tenantId 已在入队时确定）。
   * 实例本身的 tenantId 列确保了数据归属正确。
   */
  async executeNextNode(instanceId: string): Promise<void> {
    await this.withInstanceLock(instanceId, () => this.executeNextNodeLocked(instanceId));
  }

  /**
   * executeNextNode 的锁内实现（调用方必须持有实例锁）。
   */
  private async executeNextNodeLocked(instanceId: string): Promise<void> {
    // 重新加载实例（确保拿到最新状态）
    let instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      include: { processDef: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    if (instance.status !== 'RUNNING') {
      this.logger.debug(`实例 ${instanceId} 状态为 ${instance.status}，跳过执行`);
      return;
    }

    // 循环预算：统计该实例历史节点执行次数，超过上限视为循环 Schema（B3 防护）
    const executedCount = await prisma.nodeExecution.count({ where: { instanceId } });
    if (executedCount > ProcessEngine.MAX_NODE_EXECUTIONS) {
      const errorMsg = `检测到循环执行：节点累计执行 ${executedCount} 次超过上限 ${ProcessEngine.MAX_NODE_EXECUTIONS}，请检查流程 Schema 是否存在环路`;
      this.logger.error(`实例 ${instanceId} ${errorMsg}`);
      await prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'FAILED', error: errorMsg },
      });
      return;
    }

    const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const variables = (instance.variables as Record<string, unknown>) ?? {};

    // 处理活跃令牌，逐个推进
    while (instance.activeNodeIds.length > 0 && instance.status === 'RUNNING') {
      // B4 防护：跳过处于 WAITING 状态的令牌（延时/人工等待中，由恢复任务或审批驱动），
      // 防止其他分支的 job 重复执行等待中的节点（重复调度延时 job / 重复推进）
      const waitingExecutions = await prisma.nodeExecution.findMany({
        where: { instanceId, status: 'WAITING' },
        select: { nodeId: true },
      });
      const waitingNodeIds = new Set(waitingExecutions.map((w) => w.nodeId));
      const nodeId = instance.activeNodeIds.find((id) => !waitingNodeIds.has(id));
      if (!nodeId) {
        // 所有令牌都在等待 — 退出，由延时恢复/审批完成驱动后续推进
        this.logger.debug(`实例 ${instanceId} 所有活跃令牌均在等待中，退出本轮推进`);
        return;
      }

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
      const nextNodeIds = this.resolveNextNodes(node, result, schema, variables);
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
      startSubProcess: (defId, trigCtx) => this.startProcess(instance.tenantId, defId, trigCtx),
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
        this.logger.log(`实例 ${instance.id} 在节点 ${node.id} 暂停，等待人工任务`);
        return { result, completed: false };
      }

      return { result, completed: true };
    } catch (err) {
      // 节点执行失败，标记 FAILED
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`实例 ${instance.id} 节点 ${node.id} 执行失败: ${errorMsg}`);
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
   * @param tenantId 租户 ID（防御性校验，确保任务属于该租户）
   */
  async completeTask(
    taskId: string,
    userId: string,
    decision: string,
    comment: string | undefined,
    formData: Record<string, unknown> | undefined,
    tenantId?: string,
  ): Promise<void> {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId, ...(tenantId ? { tenantId } : {}) },
      include: { instance: { include: { processDef: true } } },
    });
    if (!task) throw new NotFoundException('任务不存在');

    const decisionUpper = decision.toUpperCase();
    // 兼容 "approve"/"approved" 两种写法
    const isApproved = decisionUpper === 'APPROVED' || decisionUpper === 'APPROVE';
    const isRejected = decisionUpper === 'REJECTED' || decisionUpper === 'REJECT';

    // B4 修复：未知 decision 值此前被当作 DELEGATED 并继续推进流程，
    // 拼写错误（如 "aprove"）会导致审批静默通过。
    if (!isApproved && !isRejected) {
      throw new BadRequestException(`无效的审批决策: "${decision}"，仅支持 approve/reject`);
    }

    const taskStatus = isApproved ? 'APPROVED' : 'REJECTED';

    // B2 防护：原子认领任务 — 仅当任务仍为 PENDING 时更新成功。
    // 并发/双击审批只有一个请求 count=1，其余拒绝，保证下游节点不重复执行。
    const claimed = await prisma.processTask.updateMany({
      where: { id: taskId, status: 'PENDING' },
      data: {
        status: taskStatus,
        decision: decisionUpper,
        comment,
        formdata: (formData ?? null) as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: '任务已完成或已取消',
      });
    }

    // 实例状态推进与 worker 的令牌推进互斥（同进程内）
    await this.withInstanceLock(task.instance.id, async () => {
      // B2 修复：锁内重新加载实例，确保拿到最新 activeNodeIds/variables。
      // 此前使用锁外读取的 task.instance.* 快照，并行双任务会读到相同快照
      // 导致后写入者覆盖先写入者的令牌（令牌丢失 → 实例卡死）。
      const instance = await prisma.processInstance.findFirst({
        where: { id: task.instance.id },
        include: { processDef: true },
      });
      if (!instance) throw new NotFoundException('流程实例不存在或已被删除');

      // 写入任务决策到节点输出变量，供下游节点引用
      const variables = (instance.variables as Record<string, unknown>) ?? {};
      writeNodeOutput(variables, task.nodeId, {
        decision: decisionUpper,
        comment,
        formData,
        assignee: userId,
      });

      const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
      const currentActive = (instance.activeNodeIds as string[]) ?? [];

      // 驳回逻辑：如果 decision=reject/rejected 且节点配置了 rejectToNodeId，
      // 则跳过正常下游节点，直接将 token 跳回 rejectToNodeId
      let nextNodeIds: string[];
      if (isRejected) {
        // 从节点 data 中读取 rejectToNodeId 配置
        const currentNode = schema.nodes?.find((n) => n.id === task.nodeId);
        const rejectToNodeId = currentNode?.data?.rejectToNodeId as string | undefined;
        if (rejectToNodeId) {
          // 驳回：跳回指定节点
          nextNodeIds = [rejectToNodeId];
          this.logger.log(`任务 ${taskId} 驳回，实例 ${instance.id} 跳回节点 ${rejectToNodeId}`);
        } else {
          // 未配置驳回目标，按正常流程走（reject 作为条件供下游 condition 判断）
          nextNodeIds = this.resolveEdgeTargets(schema, task.nodeId, variables);
        }
      } else {
        // 正常推进：移除当前节点，按边级条件求值添加下游节点
        nextNodeIds = this.resolveEdgeTargets(schema, task.nodeId, variables);
      }

      const updatedActive = [
        ...new Set([...currentActive.filter((id) => id !== task.nodeId), ...nextNodeIds]),
      ];

      // 标记关联 NodeExecution 完成 + 更新实例状态和活跃节点
      await prisma.$transaction([
        prisma.processInstance.update({
          where: { id: instance.id },
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

      this.logger.log(`任务 ${taskId} 已完成（${decisionUpper}），实例 ${instance.id} 恢复执行`);

      // --- 抄送逻辑 ---
      await this.sendCcNotification(
        schema,
        task.nodeId,
        instance.tenantId,
        instance.processDef.appId,
        instance.processDef.name,
        task.taskName,
        decisionUpper,
        comment,
      );
    });

    // 异步入队：由 BullMQ Worker 消费推进令牌
    await this.processQueue.add('execute', { instanceId: task.instance.id });
  }

  // ===========================================================================
  // 取消流程
  // ===========================================================================

  /**
   * 取消/终止流程实例。
   * 取消所有待办任务，实例置为 TERMINATED。
   *
   * @param tenantId 租户 ID（防御性校验，确保实例属于该租户）
   */
  async cancelProcess(instanceId: string, tenantId?: string): Promise<void> {
    await this.withInstanceLock(instanceId, async () => {
      const instance = await prisma.processInstance.findFirst({
        where: { id: instanceId, ...(tenantId ? { tenantId } : {}) },
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
    });
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
    await this.withInstanceLock(instanceId, () => this.resumeDelayedNodeLocked(instanceId, nodeId));
  }

  /**
   * resumeDelayedNode 的锁内实现（调用方必须持有实例锁）。
   */
  private async resumeDelayedNodeLocked(instanceId: string, nodeId: string): Promise<void> {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      include: { processDef: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    // 延时节点恢复时，实例状态应为 WAITING_USER_TASK（delay executor 返回 wait: true 导致）
    // 也可能是 RUNNING（其他场景），两者都允许恢复
    if (instance.status !== 'RUNNING' && instance.status !== 'WAITING_USER_TASK') {
      this.logger.debug(`实例 ${instanceId} 状态为 ${instance.status}，延时恢复跳过`);
      return;
    }

    // B4 防护：校验该节点的令牌仍然活跃且处于 WAITING —
    // 重复投递的 delayed job（或已被取消的实例）不应再次推进令牌
    const activeNodeIds = (instance.activeNodeIds as string[]) ?? [];
    if (!activeNodeIds.includes(nodeId)) {
      this.logger.debug(
        `实例 ${instanceId} 节点 ${nodeId} 的令牌已不活跃（已推进或实例已变更），延时恢复跳过`,
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

    // 推进令牌：移除当前延时节点的令牌，按边级条件求值添加下游节点令牌
    const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const nextNodeIds = this.resolveEdgeTargets(
      schema,
      nodeId,
      (instance.variables as Record<string, unknown>) ?? {},
    );

    await this.advanceTokens(
      instance,
      nodeId,
      nextNodeIds,
      (instance.variables as Record<string, unknown>) ?? {},
    );

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
  async scheduleDelay(instanceId: string, nodeId: string, delayMs: number): Promise<void> {
    // 标记 NodeExecution 为 WAITING
    await prisma.nodeExecution.updateMany({
      where: { instanceId, nodeId, status: 'RUNNING' },
      data: { status: 'WAITING' },
    });

    // 添加 delayed job
    await this.delayQueue.add('resume', { instanceId, nodeId }, { delay: delayMs });

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

  /**
   * 按 ID 查找节点（递归搜索嵌套 blocks）。
   *
   * 条件分支节点的分支容器（type='block'）嵌套在 conditionNode.blocks[] 中，
   * 需要递归查找才能定位。
   */
  private findNode(schema: WorkflowSchema, nodeId: string): WorkflowNode | undefined {
    // 先在顶层节点中查找
    for (const node of schema.nodes) {
      if (node.id === nodeId) return node;
      // 递归搜索嵌套 blocks（条件分支的分支容器等）
      if (node.blocks) {
        const found = findNodeInBlocks(node.blocks, nodeId);
        if (found) return found;
      }
    }
    return undefined;
  }

  /** 获取节点的出边列表。 */
  private getOutgoingEdges(schema: WorkflowSchema, nodeId: string): WorkflowEdge[] {
    return schema.edges.filter((e) => e.sourceNodeID === nodeId);
  }

  /**
   * 按条件求值筛选节点的出边目标（B5：边级 condition 字段求值）。
   *
   * edge.condition 为 JsonLogic JSON（如 {"==":[{"var":"decision"},"APPROVED"]}）：
   * - 有 condition 的边：对流程变量求值为 truthy 才通过
   * - 无 condition 的边：无条件通过
   * - 求值异常的边：跳过（保守，避免误触发下游副作用节点）
   */
  private resolveEdgeTargets(
    schema: WorkflowSchema,
    nodeId: string,
    variables: Record<string, unknown>,
  ): string[] {
    const outgoing = this.getOutgoingEdges(schema, nodeId);
    const matched: string[] = [];
    for (const edge of outgoing) {
      if (!edge.condition) {
        matched.push(edge.targetNodeID);
        continue;
      }
      try {
        const rule =
          typeof edge.condition === 'string' ? JSON.parse(edge.condition) : edge.condition;
        if (evaluateCondition(rule, variables)) {
          matched.push(edge.targetNodeID);
        }
      } catch {
        this.logger.warn(`边 ${edge.sourceNodeID} → ${edge.targetNodeID} 条件解析失败，跳过`);
      }
    }
    return matched;
  }

  /**
   * 计算节点的下一节点 ID 列表。
   * - 执行器显式返回 nextNodeIds：使用之（条件/并行节点）
   * - 否则：按边级条件求值筛选出边（无条件的边直接通过）
   * - 空数组表示令牌终止（End 节点）
   */
  private resolveNextNodes(
    node: WorkflowNode,
    result: import('./types.js').NodeExecutionResult,
    schema: WorkflowSchema,
    variables: Record<string, unknown>,
  ): string[] {
    if (result.nextNodeIds) {
      return result.nextNodeIds;
    }
    return this.resolveEdgeTargets(schema, node.id, variables);
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
  private async removeActiveNode(instance: InstanceRow, nodeId: string): Promise<InstanceRow> {
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
        where: { roleId: { in: ccRecipients }, role: { tenantId } },
        select: { userId: true },
      });
      return [...new Set(userRoles.map((r) => r.userId))];
    }

    if (ccAssigneeType === 'ORG') {
      const members = await prisma.orgMember.findMany({
        where: { orgId: { in: ccRecipients }, org: { tenantId } },
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
      // 兼容 "APPROVE"/"APPROVED" 两种写法
      const isApproved = decisionUpper === 'APPROVED' || decisionUpper === 'APPROVE';
      const isRejected = decisionUpper === 'REJECTED' || decisionUpper === 'REJECT';
      const shouldNotify =
        ccTrigger === 'onComplete' ||
        (ccTrigger === 'onApprove' && isApproved) ||
        (ccTrigger === 'onReject' && isRejected);
      if (!shouldNotify) return;

      const ccType = (nodeData.ccAssigneeType as string) ?? 'USER';
      const ccList = (nodeData.ccRecipients as string[]) ?? [];
      const userIds = await this.resolveCcRecipients(tenantId, ccType, ccList);
      if (userIds.length === 0) return;

      const decisionText = isApproved ? '通过' : '驳回';
      await this.inAppMessageService.create({
        tenantId,
        appId,
        userIds,
        title: '审批抄送通知',
        body: `流程「${processName}」的审批节点「${taskName}」已由审批人${decisionText}。${comment ? '备注：' + comment : ''}`,
      });

      this.logger.log(`抄送通知已发送：实例节点 ${nodeId}，收件人 ${userIds.length} 人`);
    } catch (err) {
      // 通知发送失败不阻塞流程
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`抄送通知发送失败（节点 ${nodeId}）: ${errorMsg}`);
    }
  }
}
