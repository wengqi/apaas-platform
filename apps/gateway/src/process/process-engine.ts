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

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { prisma, Prisma, getEnvironmentId, runWithEnv } from '@apaas/db';
import type { WorkflowSchema, WorkflowNode, WorkflowEdge } from '@apaas/shared';
import { NodeExecutorRegistry } from './node-executor.registry.js';
import { resolveInputs, writeNodeOutput, evaluateCondition } from './process-utils.js';
import type { ExecutionContext, InstanceRow } from './types.js';
import { PROCESS_QUEUE, DELAY_QUEUE } from '../queue/queue.constants.js';
import { InAppMessageService } from '../notification/in-app-message.service.js';
import { RedisLockService } from '../common/redis/redis-lock.service.js';
import { EnvironmentResolverService } from '../environment/environment-resolver.service.js';
import { RecordService } from '../record/record.service.js';

/**
 * 评审 P1-6：队列作业统一重试/清理策略。
 * 瞬时 DB 抖动导致的推进失败不再让实例永久卡 RUNNING；
 * completed/failed 作业保留有限时间供排障，避免 Redis 无限堆积。
 */
const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 },
} as const;

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

/** 依次审批（R1.3）进度存于节点变量 sequentialIndex（variables[nodeId].sequentialIndex）。 */
function nodeIdSeqKey(nodeId: string): string {
  return nodeId;
}
void nodeIdSeqKey;

/**
 * 并行/包容分支汇聚等待状态（存储于 variables[JOIN_STATE_KEY]，键 = 汇聚节点 ID）。
 * 引擎在分支分裂时注册 expected（分支数），令牌逐个到达时累加 arrived，
 * 全部到达后放行汇聚节点（严格 AND-join / OR-join）。
 */
interface JoinWaitState {
  expected: number;
  arrived: number;
}

@Injectable()
export class ProcessEngine {
  private readonly logger = new Logger(ProcessEngine.name);

  /** 单实例最大节点执行次数（循环预算）— 超过视为循环 Schema，实例置 FAILED。 */
  private static readonly MAX_NODE_EXECUTIONS = 1000;

  /** variables 中存储分支汇聚等待状态的键（对用户不可见的引擎内部状态）。 */
  private static readonly JOIN_STATE_KEY = '_joins';

  /** 等待条件节点默认轮询间隔（ms）。 */
  private static readonly DEFAULT_WAIT_CONDITION_POLL_MS = 60_000;

  /** 等待条件节点默认超时（ms，24 小时）。 */
  private static readonly DEFAULT_WAIT_CONDITION_TIMEOUT_MS = 86_400_000;

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
    private readonly redisLock: RedisLockService,
    private readonly environmentResolver: EnvironmentResolverService,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
    @Inject(DELAY_QUEUE) private readonly delayQueue: Queue,
    // 交互评审（2026-10-04）P0：审批结果自动回写复用记录写内核
    @Inject(forwardRef(() => RecordService))
    private readonly recordService: RecordService,
  ) {}

  /**
   * 在实例级互斥锁内执行 fn。
   * 同一实例的操作按调用顺序串行；不同实例互不阻塞。
   */
  private async withInstanceLock<T>(instanceId: string, fn: () => Promise<T>): Promise<T> {
    // 评审 P0-2：升级为 Redis 分布式锁（跨副本互斥）；Redis 不可用时服务内部
    // 自动降级为进程内互斥，单副本开发环境不受影响。
    return this.redisLock.withLock(`process-instance:${instanceId}`, fn);
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
    envKey?: string,
    /** G6：显式 schema 覆盖（流程 API 钉 major 的冻结契约直通，跳过 bundle/活表解析） */
    schemaOverride?: Record<string, unknown>,
  ): Promise<string> {
    // R1.4：解析环境（显式参数 > ALS > prod）——bundle 内的流程视为已发布语义
    const env = envKey ?? getEnvironmentId() ?? 'prod';

    // 先查活表定位流程（拿 appId 供 bundle 解析；活表行始终存在，含流程元信息）
    const liveDef = await prisma.processDef.findFirst({
      where: { id: processDefId, tenantId },
    });
    if (!liveDef) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '流程不存在',
      });
    }

    const resolved = await this.environmentResolver.resolve(tenantId, liveDef.appId, env);

    const bundled = resolved.bundle
      ? resolved.bundle.processes.find((p) => p.id === processDefId)
      : undefined;

    let def: {
      id: string;
      apiName: string;
      name: string;
      version: number;
      workflowSchema: unknown;
      triggerType: string | null;
    };

    if (schemaOverride) {
      // G6：钉 major 的冻结契约直通（def 行仅作元信息/FK，schema 以发布快照为准）
      def = {
        id: liveDef.id,
        apiName: liveDef.apiName,
        name: liveDef.name,
        version: liveDef.version,
        triggerType: liveDef.triggerType,
        workflowSchema: schemaOverride,
      };
    } else if (bundled) {
      // bundle 模式：workflowSchema 取自不可变快照（版本切换不影响新实例语义）
      def = {
        id: liveDef.id,
        apiName: liveDef.apiName,
        name: liveDef.name,
        version: liveDef.version,
        triggerType: liveDef.triggerType,
        workflowSchema: bundled.workflowSchema,
      };
    } else {
      // 流程级发布语义：流程可独立于应用部署单独发布（流程发布不切环境指针），
      // 手动触发启动按流程自身的 PUBLISHED 定义执行；自动触发走环境 bundle（trigger.service）。
      if (liveDef.status !== 'PUBLISHED') {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: '流程未发布，无法启动（需先发布）',
        });
      }
      def = liveDef;
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
        environmentId: env,
        frozenWorkflowSchema: schema as unknown as Prisma.InputJsonValue,
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
    await this.processQueue.add('execute', { instanceId: instance.id }, DEFAULT_JOB_OPTS);
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
    envKey?: string,
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

    return runWithEnv(def.tenantId, envKey ?? 'prod', () =>
      this.startProcess(def.tenantId, def.id, triggerContext, envKey),
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
    await this.withInstanceLock(instanceId, async () => {
      // R1.4：节点执行在实例所属环境上下文中进行——节点内的记录写/触发
      // 自动落入同一环境（ALS environmentId 注入 records/node_executions）
      const instanceEnv = await this.instanceEnvironment(instanceId);
      await runWithEnv(instanceEnv.tenantId, instanceEnv.environmentId, () =>
        this.executeNextNodeLocked(instanceId),
      );
    });
  }

  /** 读取实例的租户与环境（节点执行上下文用；实例不存在时抛错交由上层处理） */
  private async instanceEnvironment(
    instanceId: string,
  ): Promise<{ tenantId: string; environmentId: string }> {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      select: { tenantId: true, environmentId: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    return { tenantId: instance.tenantId, environmentId: instance.environmentId };
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

    // R1.4：优先使用实例启动时冻结的流程 schema（版本切换不影响在途实例语义）
    const schema = (instance.frozenWorkflowSchema ??
      instance.processDef.workflowSchema) as unknown as WorkflowSchema;
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
      // ✅1 边走向留痕（Temporal 借鉴 §8.1）：路由决策落 NodeExecution.output，
      // C1 类"静默终结/为什么走这条边"事故可事后归因；条件求值快照已在实例 variables
      await prisma.nodeExecution.updateMany({
        where: { instanceId: instance.id, nodeId, status: 'COMPLETED' },
        data: {
          output: {
            ...(result.output ?? {}),
            _routing: { nextNodeIds, at: new Date().toISOString() },
          } as Prisma.InputJsonValue,
        },
      });
      // 移除当前令牌，添加下游令牌
      instance = await this.advanceTokens(instance, nodeId, nextNodeIds, variables);
    }

    // 无活跃令牌 → 实例完成（或等待汇聚中的其他分支令牌）
    if (instance.activeNodeIds.length === 0 && instance.status === 'RUNNING') {
      const pendingJoins = this.getJoinStates(variables);
      if (Object.keys(pendingJoins).length > 0) {
        // 存在未完成的分支汇聚等待：保持 RUNNING，等待其他分支的 job 投递令牌。
        // 若分支令牌因路径发散永远不到达，实例将停留在 RUNNING（ProcessMonitor 可见）。
        this.logger.warn(
          `实例 ${instanceId} 暂无活跃令牌但存在 ${Object.keys(pendingJoins).length} 个未完成的分支汇聚等待，保持 RUNNING`,
        );
        return;
      }

      await prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      this.logger.log(`流程实例 ${instanceId} 已完成`);

      // 子流程同步等待：子实例完成后恢复父实例的等待节点
      const parentLink = this.extractParentLink(instance.triggerContext);
      if (parentLink) {
        await this.resumeParentAfterSubProcess(
          parentLink.instanceId,
          parentLink.nodeId,
          instance.id,
          'COMPLETED',
        );
      }
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
      schema,
      startSubProcess: (defId, trigCtx) => this.startProcess(instance.tenantId, defId, trigCtx),
      scheduleDelay: (instanceId, nodeId, delayMs, kind) =>
        this.scheduleDelay(instanceId, nodeId, delayMs, kind),
      scheduleTaskTimeout: (instanceId, nodeId, nodeExecutionId, delayMs) =>
        this.scheduleTaskTimeout(instanceId, nodeId, nodeExecutionId, delayMs),
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
      // 节点执行失败
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`实例 ${instance.id} 节点 ${node.id} 执行失败: ${errorMsg}`);

      // S2 失败处理（错误出口路由）：节点有 label 为 error/失败 的出边时，
      // 令牌路由到该分支（补偿/通知/回写由搭建者显式画节点），实例不失败；
      // NodeExecution 仍留痕 FAILED（错误信息不因路由掩盖）。无 error 出边时维持实例 FAILED。
      const errorEdge = schema.edges.find(
        (e) => e.sourceNodeID === node.id && (e.label === 'error' || e.label === '失败'),
      );
      if (errorEdge) {
        this.logger.warn(
          `实例 ${instance.id} 节点 ${node.id} 失败已路由到 error 分支 ${errorEdge.targetNodeID}`,
        );
        await prisma.nodeExecution.update({
          where: { id: nodeExecution.id },
          data: {
            status: 'FAILED',
            error: errorMsg,
            finishedAt: new Date(),
          },
        });
        // 显式 nextNodeIds 交由调用方循环推进（移除当前令牌 + 添加 error 目标）
        return {
          result: {
            nextNodeIds: [errorEdge.targetNodeID],
            output: { _errorRouted: errorMsg },
          },
          completed: true,
        };
      }

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

      // 子流程同步等待：子实例失败时同步失败父实例，避免父实例永久挂起
      const parentLink = this.extractParentLink(instance.triggerContext);
      if (parentLink) {
        await this.resumeParentAfterSubProcess(
          parentLink.instanceId,
          parentLink.nodeId,
          instance.id,
          'FAILED',
          errorMsg,
        );
      }
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

    // 决策规范值（R5.5 实测修复 2026-10-09）：引擎宽容接受 approve/APPROVE/
    // APPROVED 等写法，但若变量注入原始大写串，边条件按方言指南写
    // {"==":[{"var":"decision"},"APPROVED"]} 在调用方传 "approve" 时恒 false
    // → 条件边全不匹配 → 令牌静默终结（实例 COMPLETED 零回写零通知）。
    // 决策变量一律注入二值规范值，输入宽容、输出严格。
    const canonicalDecision = isApproved ? 'APPROVED' : 'REJECTED';

    const taskStatus = isApproved ? 'APPROVED' : 'REJECTED';

    // #16：节点配置 allowReject=false 时禁止驳回决策（配置侧栏可设，此前从未强制）。
    // 未配置（undefined）视为允许（与表单默认一致）。优先实例冻结 schema。
    if (isRejected) {
      const cfgSchema = (task.instance.frozenWorkflowSchema ??
        task.instance.processDef.workflowSchema) as {
        nodes?: Array<{ id?: string; data?: Record<string, unknown> }>;
      } | null;
      const cfgNode = cfgSchema?.nodes?.find((n) => n.id === task.nodeId);
      if (cfgNode?.data?.['allowReject'] === false) {
        throw new BadRequestException('该审批节点已配置为不允许驳回');
      }
      // 语义裁决（2026-10-06，产品确认）：流程图未配置驳回跳转（rejectToNodeId
      // 为空）时，运行时不提供驳回操作——驳回操作的存在性由流程图配置驱动，
      // 每个动作逻辑自洽；此前"无驳回边时驳回继续走下游"的行走为废止。
      const rejectToNodeId = cfgNode?.data?.['rejectToNodeId'];
      if (typeof rejectToNodeId !== 'string' || rejectToNodeId.trim() === '') {
        throw new BadRequestException(
          '该审批节点未配置驳回跳转（rejectToNodeId）：流程图无驳回路径时，运行时不提供驳回操作',
        );
      }
    }

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

    // S1：批次内已无 PENDING 任务时取消超时 job（部分终态时保留，剩余任务到点仍可动作）
    const remainingPending = await prisma.processTask.count({
      where: {
        instanceId: task.instanceId,
        nodeId: task.nodeId,
        nodeExecutionId: task.nodeExecutionId,
        status: 'PENDING',
      },
    });
    if (remainingPending === 0 && task.nodeExecutionId) {
      await this.cancelTaskTimeout(task.nodeExecutionId);
    }

    // R1.3 多人审批聚合：同节点同批次还有其他 PENDING 任务时不立即推进令牌。
    //   countersign 会签：等全部 approved；任一 rejected → 节点立即驳回
    //   or_sign 或签：首个决策即节点决策，终结同批次其余 PENDING 任务
    //   sequential 依次：approved → 下标 +1 重新进入 user_task 执行器生成下一个任务；
    //     最后一人 approved 才推进；任一 rejected 直接驳回
    // 判定依据：该 nodeId 下（同实例）全部任务的决策集合 vs 节点配置的审批模式。
    const siblingTasks = await prisma.processTask.findMany({
      where: { instanceId: task.instanceId, nodeId: task.nodeId },
      select: { id: true, status: true, assignee: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const nodeDef = (
      task.instance.processDef.workflowSchema as {
        nodes?: Array<{ id?: string; data?: Record<string, unknown> }>;
      } | null
    )?.nodes?.find((n) => n.id === task.nodeId);
    // QA 实测（2026-10-03）：与 user-task.executor 同口径，大小写归一化
    const approvalMode = (
      (nodeDef?.data?.['approvalMode'] as string | undefined) ?? 'single'
    ).toLowerCase();
    const approveUsers = (nodeDef?.data?.['approveUsers'] as string[] | undefined) ?? [];

    if (approvalMode !== 'single') {
      const pendingCount = siblingTasks.filter((t) => t.status === 'PENDING').length;
      const approvedCount = siblingTasks.filter((t) => t.status === 'APPROVED').length;

      if (approvalMode === 'or_sign') {
        // 或签：首个决策终结其余 PENDING 任务，立即按该决策推进
        await prisma.processTask.updateMany({
          where: { instanceId: task.instanceId, nodeId: task.nodeId, status: 'PENDING' },
          data: { status: 'CANCELLED', completedAt: new Date() },
        });
        this.logger.log(
          `或签节点 ${task.nodeId} 由任务 ${taskId} 决策（${decisionUpper}）终结，取消 ${pendingCount} 个并行任务`,
        );
        // 落到下方正常推进逻辑（isRejected/isApproved 已按首个决策确定）
      } else if (approvalMode === 'countersign') {
        if (isRejected) {
          // 会签任一拒绝：立即驳回，取消其余 PENDING
          await prisma.processTask.updateMany({
            where: { instanceId: task.instanceId, nodeId: task.nodeId, status: 'PENDING' },
            data: { status: 'CANCELLED', completedAt: new Date() },
          });
          this.logger.log(`会签节点 ${task.nodeId} 任一拒绝，取消 ${pendingCount} 个并行任务`);
        } else if (pendingCount > 0) {
          // 还有未决任务：不推进，等齐（无需写变量——决策已在任务行上）
          this.logger.log(
            `会签节点 ${task.nodeId} 进度 ${approvedCount}/${siblingTasks.length}，等待剩余 ${pendingCount} 任务`,
          );
          return;
        }
        // 全部 approved → 落到下方正常推进
      } else if (approvalMode === 'sequential') {
        if (isRejected) {
          // 依次审批任一环节拒绝：直接按驳回推进
          this.logger.log(`依次审批节点 ${task.nodeId} 发生拒绝，驳回`);
        } else {
          // 进度真值 = 节点变量 sequentialIndex（当前完成人的下标+1 指向下一位），
          // 不用任务行计数（驳回重跳/加签会产生历史任务导致计数失真）。
          // 语义：sequentialIndex 指向"当前在审/刚审完"的人；approve 后 +1 指向下一人。
          const nodeScope =
            ((task.instance.variables as Record<string, unknown> | null)?.[task.nodeId] as
              Record<string, unknown> | undefined) ?? {};
          const currentIdx =
            typeof nodeScope['sequentialIndex'] === 'number'
              ? (nodeScope['sequentialIndex'] as number)
              : 0;
          const nextIndex = currentIdx + 1;
          if (nextIndex < approveUsers.length) {
            // 未到最后一人：推进进度下标，生成下一人任务
            const seqVars = (task.instance.variables as Record<string, unknown>) ?? {};
            await prisma.processInstance.update({
              where: { id: task.instance.id },
              data: {
                variables: {
                  ...seqVars,
                  [task.nodeId]: { ...nodeScope, sequentialIndex: nextIndex },
                } as Prisma.InputJsonValue,
              },
            });
            await prisma.processTask.create({
              data: {
                tenantId: task.tenantId,
                instanceId: task.instanceId,
                nodeExecutionId: task.nodeExecutionId,
                nodeId: task.nodeId,
                taskName: task.taskName,
                assignee: approveUsers[nextIndex]!,
                candidateGroups: [],
                status: 'PENDING',
              },
            });
            this.logger.log(
              `依次审批节点 ${task.nodeId} 进入第 ${nextIndex + 1}/${approveUsers.length} 人`,
            );
            return;
          }
          // 最后一人 approved → 落到下方正常推进
          this.logger.log(`依次审批节点 ${task.nodeId} 全部 ${approveUsers.length} 人通过`);
        }
      }
    }

    // 实例状态推进与 worker 的令牌推进互斥（同进程内）
    // 锁回调返回 false = 聚合未完成（会签等待中），跳过令牌推进
    const lockResult = await this.withInstanceLock(task.instance.id, async (): Promise<boolean> => {
      // B2 修复：锁内重新加载实例，确保拿到最新 activeNodeIds/variables。
      // 此前使用锁外读取的 task.instance.* 快照，并行双任务会读到相同快照
      // 导致后写入者覆盖先写入者的令牌（令牌丢失 → 实例卡死）。
      const instance = await prisma.processInstance.findFirst({
        where: { id: task.instance.id },
        include: { processDef: true },
      });
      if (!instance) throw new NotFoundException('流程实例不存在或已被删除');

      // 评审 P1-2：锁内校验实例状态——已取消/已完成的实例不得被审批动作复活。
      // 时序：任务认领(无锁) → cancelProcess 拿锁 TERMINATED → completeTask 拿锁。
      if (instance.status !== 'RUNNING' && instance.status !== 'WAITING_USER_TASK') {
        await prisma.processTask
          .updateMany({
            where: { id: taskId, status: taskStatus },
            data: { status: 'CANCELLED', completedAt: new Date() },
          })
          .catch(() => {});
        throw new ConflictException(
          `流程实例已${instance.status === 'TERMINATED' ? '取消' : '结束'}，任务作废`,
        );
      }

      // 写入任务决策到节点输出变量，供下游节点引用
      const variables = (instance.variables as Record<string, unknown>) ?? {};
      writeNodeOutput(variables, task.nodeId, {
        decision: canonicalDecision,
        comment,
        formData,
        assignee: userId,
      });
      // 决策顶层别名（R5.5 实测修复 2026-10-09）：决策仅存在于节点命名空间
      // （<nodeId>.output.decision），方言指南/画布教的边条件 {"var":"decision"}
      // 求值顶层恒 undefined → 条件边全不匹配 → 令牌静默终止（实例 COMPLETED
      // 但零回写零通知）。注入顶层规范别名使指南契约成真；dotted 用法不受影响。
      variables['decision'] = canonicalDecision;

      // R1.3 会签并发封窗：锁内重验同节点 PENDING——聚合判定在锁外读数存在
      // 竞态窗口（两个会签任务并发 complete 双推进），以锁内为准做最终裁决。
      // 或签的兄弟任务已被锁外取消，这里 PENDING 计数自然为 0，不受影响。
      if (approvalMode === 'countersign' && isApproved) {
        const stillPending = await prisma.processTask.count({
          where: { instanceId: task.instanceId, nodeId: task.nodeId, status: 'PENDING' },
        });
        if (stillPending > 0) {
          this.logger.log(
            `会签节点 ${task.nodeId} 锁内重验仍有 ${stillPending} 个 PENDING，等待（防并发双推进）`,
          );
          return false;
        }
      }

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

      // 汇聚门控：并行分支内的人工任务完成后，下游汇聚点需等待全部分支令牌
      const activated = this.gateJoinArrivals(variables, nextNodeIds);
      const updatedActive = [
        ...new Set([...currentActive.filter((id) => id !== task.nodeId), ...activated]),
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

      // 交互评审（2026-10-04）P0：审批结果自动回写触发记录——
      // 小白最短路径（表单提交→审批）此前审批通过后记录状态字段永远停留原值，
      // 构成"反馈环三断"之首。节点配置 node.data.writeback = { field, approveValue, rejectValue }，
      // 记录上下文取自实例变量（记录创建触发器写入的 recordId）。
      await this.writebackApprovalResult(task, instance, nodeDef, variables, isApproved, userId);

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

      // --- 审批结果默认通知（业务用户旅程 R3 2026-10-06）---
      await this.notifyInitiatorDefault(schema, instance, task, isApproved, comment);
      return true;
    });

    // 锁回调返回 false = 聚合未完成（会签等待），不推进令牌
    const shouldAdvance = await lockResult;
    if (!shouldAdvance) return;

    // 异步入队：由 BullMQ Worker 消费推进令牌
    await this.processQueue.add('execute', { instanceId: task.instance.id }, DEFAULT_JOB_OPTS);
  }

  /**
   * 审批结果自动回写触发记录（交互评审 2026-10-04 P0）。
   *
   * 节点配置 node.data.writeback = { field, approveValue, rejectValue }：
   * 节点决策定论后（聚合完成、令牌推进成功）把对应值写入触发记录的字段。
   * - 记录上下文取实例变量 recordId（记录创建/更新触发器写入）；无记录上下文
   *   （手动/API/定时触发）时跳过并留痕。
   * - 回写失败不阻断审批推进（决策已生效），但必须显式记录错误。
   * - 复用记录写内核（部分 merge + 公式/Rollup 重算 + 记录事件——
   *   记录更新触发器因此可被联动触发，与飞书式自动化语义一致）。
   */
  private async writebackApprovalResult(
    task: { id: string; nodeId: string },
    instance: { id: string; tenantId: string },
    nodeDef: { data?: Record<string, unknown> } | undefined,
    variables: Record<string, unknown>,
    isApproved: boolean,
    approverId: string,
  ): Promise<void> {
    const writeback = nodeDef?.data?.['writeback'] as
      { field?: string; approveValue?: string; rejectValue?: string } | undefined;
    if (!writeback?.field) return;

    const value = isApproved ? writeback.approveValue : writeback.rejectValue;
    if (value === undefined || value === null || value === '') return;

    const recordId =
      typeof variables['recordId'] === 'string' ? (variables['recordId'] as string) : undefined;
    if (!recordId) {
      this.logger.warn(
        `节点 ${task.nodeId} 配置了审批回写，但实例 ${instance.id} 无记录上下文（非记录触发），跳过`,
      );
      return;
    }

    try {
      await this.recordService.update(instance.tenantId, recordId, approverId, {
        [writeback.field]: value,
      });
      this.logger.log(
        `审批回写：记录 ${recordId}.${writeback.field} = ${value}（任务 ${task.id}，审批人 ${approverId}）`,
      );
    } catch (err) {
      this.logger.error(
        `审批回写失败（不阻断审批推进）：任务 ${task.id} 记录 ${recordId} 字段 ${writeback.field}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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

    // 完成节点并推进令牌到下游
    await this.completeWaitingNodeAndAdvance(instance, nodeId);

    this.logger.log(`实例 ${instanceId} 延时节点 ${nodeId} 已恢复，继续推进令牌`);

    // 重新入队推进下一节点
    await this.processQueue.add('execute', { instanceId }, DEFAULT_JOB_OPTS);
  }

  // ===========================================================================
  // 等待条件节点恢复
  // ===========================================================================

  /**
   * 恢复等待条件节点 — BullMQ delayed job（kind='wait_condition'）到时后调用。
   *
   * 重新求值节点配置的等待条件：
   * - 满足 → 完成节点并推进令牌
   * - 未满足且未超时 → 重新调度下次检查（BullMQ delayed job 轮询，事件驱动非 setInterval）
   * - 未满足且已超时 → 路由到 label 为 timeout 的出边；未配置则实例置 FAILED
   */
  async resumeWaitCondition(instanceId: string, nodeId: string): Promise<void> {
    await this.withInstanceLock(instanceId, () =>
      this.resumeWaitConditionLocked(instanceId, nodeId),
    );
  }

  /**
   * resumeWaitCondition 的锁内实现（调用方必须持有实例锁）。
   */
  private async resumeWaitConditionLocked(instanceId: string, nodeId: string): Promise<void> {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      include: { processDef: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    if (instance.status !== 'RUNNING' && instance.status !== 'WAITING_USER_TASK') {
      this.logger.debug(`实例 ${instanceId} 状态为 ${instance.status}，等待条件恢复跳过`);
      return;
    }
    const activeNodeIds = (instance.activeNodeIds as string[]) ?? [];
    if (!activeNodeIds.includes(nodeId)) {
      this.logger.debug(`实例 ${instanceId} 节点 ${nodeId} 的令牌已不活跃，等待条件恢复跳过`);
      return;
    }

    const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const node = this.findNode(schema, nodeId);
    if (!node) {
      this.logger.warn(`实例 ${instanceId} 等待条件节点 ${nodeId} 不存在于 Schema，跳过恢复`);
      return;
    }
    const data = node.data as Record<string, unknown>;
    const variables = (instance.variables as Record<string, unknown>) ?? {};

    // 重新求值等待条件（JsonLogic）
    let satisfied = true;
    const conditionRaw = data['condition'];
    if (conditionRaw) {
      try {
        const rule = typeof conditionRaw === 'string' ? JSON.parse(conditionRaw) : conditionRaw;
        satisfied = evaluateCondition(rule, variables);
      } catch {
        satisfied = false;
      }
    }

    if (satisfied) {
      await this.completeWaitingNodeAndAdvance(instance, nodeId);
      this.logger.log(`实例 ${instanceId} 等待条件节点 ${nodeId} 条件已满足，继续推进令牌`);
      await this.processQueue.add('execute', { instanceId }, DEFAULT_JOB_OPTS);
      return;
    }

    // 未满足：检查是否超时（从节点进入 WAITING 起算）
    const timeoutMs = Number(data['timeoutMs'] ?? ProcessEngine.DEFAULT_WAIT_CONDITION_TIMEOUT_MS);
    const waitingExec = await prisma.nodeExecution.findFirst({
      where: { instanceId, nodeId, status: 'WAITING' },
      orderBy: { startedAt: 'desc' },
    });
    const startedMs = waitingExec?.startedAt?.getTime() ?? Date.now();

    if (Date.now() - startedMs < timeoutMs) {
      // 未超时：调度下次检查
      const pollMs = Number(data['pollIntervalMs'] ?? ProcessEngine.DEFAULT_WAIT_CONDITION_POLL_MS);
      await this.delayQueue.add(
        'resume',
        { instanceId, nodeId, kind: 'wait_condition' },
        { delay: Math.max(1000, pollMs) },
      );
      this.logger.debug(
        `实例 ${instanceId} 等待条件节点 ${nodeId} 条件未满足，${Math.max(1000, pollMs)}ms 后重新检查`,
      );
      return;
    }

    // 超时：优先路由到 label 为 timeout 的出边
    const timeoutEdge = schema.edges.find(
      (e) => e.sourceNodeID === nodeId && (e.label === 'timeout' || e.label === '超时'),
    );
    if (timeoutEdge) {
      await prisma.nodeExecution.updateMany({
        where: { instanceId, nodeId, status: 'WAITING' },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      if (instance.status === 'WAITING_USER_TASK') {
        await prisma.processInstance.update({
          where: { id: instanceId },
          data: { status: 'RUNNING' },
        });
      }
      await this.advanceTokens(instance, nodeId, [timeoutEdge.targetNodeID], variables);
      this.logger.warn(
        `实例 ${instanceId} 等待条件节点 ${nodeId} 超时，路由到 timeout 分支 ${timeoutEdge.targetNodeID}`,
      );
      await this.processQueue.add('execute', { instanceId }, DEFAULT_JOB_OPTS);
      return;
    }

    // 无 timeout 出边：实例置 FAILED
    const errorMsg = `等待条件节点 ${nodeId} 超时（${timeoutMs}ms）且未配置 timeout 出边，实例失败`;
    await prisma.$transaction([
      prisma.nodeExecution.updateMany({
        where: { instanceId, nodeId, status: 'WAITING' },
        data: { status: 'FAILED', error: errorMsg, finishedAt: new Date() },
      }),
      // 流程效率分析（P1 运维治理）：钉死"超时失败"语义，analytics 据此统计超时数
      prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'FAILED', error: errorMsg, timedOut: true },
      }),
    ]);
    this.logger.error(`实例 ${instanceId} ${errorMsg}`);
  }

  /**
   * 将处于 WAITING 的节点标记完成并推进令牌到下游（延时恢复/等待条件满足/子流程完成共用）。
   * 调用方必须持有实例锁，并已完成状态与令牌活跃性校验。
   *
   * @returns 推进后的下游节点 ID 列表
   */
  private async completeWaitingNodeAndAdvance(
    instance: InstanceRow,
    nodeId: string,
  ): Promise<string[]> {
    await prisma.nodeExecution.updateMany({
      where: { instanceId: instance.id, nodeId, status: 'WAITING' },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });

    if (instance.status === 'WAITING_USER_TASK') {
      await prisma.processInstance.update({
        where: { id: instance.id },
        data: { status: 'RUNNING' },
      });
    }

    const variables = (instance.variables as Record<string, unknown>) ?? {};
    const schema = instance.processDef.workflowSchema as unknown as WorkflowSchema;
    const nextNodeIds = this.resolveEdgeTargets(schema, nodeId, variables);
    await this.advanceTokens(instance, nodeId, nextNodeIds, variables);
    return nextNodeIds;
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
    kind: 'delay' | 'wait_condition' = 'delay',
  ): Promise<void> {
    // 标记 NodeExecution 为 WAITING
    await prisma.nodeExecution.updateMany({
      where: { instanceId, nodeId, status: 'RUNNING' },
      data: { status: 'WAITING' },
    });

    // 添加 delayed job（kind 决定恢复语义：delay=直接推进 / wait_condition=重新求值条件）
    await this.delayQueue.add('resume', { instanceId, nodeId, kind }, { delay: delayMs });

    this.logger.log(
      `实例 ${instanceId} 节点 ${nodeId} 延时 ${delayMs}ms（kind=${kind}），已调度 BullMQ delayed job`,
    );
  }

  // ===========================================================================
  // S1 审批超时边界（2026-10-15）：dueDate 到点动作（催办/自动通过/自动驳回）
  // ===========================================================================

  /** 超时动作的系统操作者（审批意见已写明"超时自动…"，前端用户名映射未命中时显示原值可接受） */
  static readonly TIMEOUT_ACTOR = 'system';

  private static taskTimeoutJobId(nodeExecutionId: string): string {
    return `task-timeout:${nodeExecutionId}`;
  }

  /**
   * 调度任务批次超时 job（user-task 执行器在 dueDate>0 且配置 timeoutAction 时调用）。
   * jobId 按批次（nodeExecutionId）幂等，任务终态后由 cancelTaskTimeout 移除。
   */
  async scheduleTaskTimeout(
    instanceId: string,
    nodeId: string,
    nodeExecutionId: string,
    delayMs: number,
  ): Promise<void> {
    await this.delayQueue.add(
      'task_timeout',
      { kind: 'task_timeout', instanceId, nodeId, nodeExecutionId },
      { delay: delayMs, jobId: ProcessEngine.taskTimeoutJobId(nodeExecutionId) },
    );
    this.logger.log(
      `实例 ${instanceId} 节点 ${nodeId} 任务批次 ${nodeExecutionId} 超时动作已调度（${Math.round(delayMs / 1000)}s）`,
    );
  }

  /** 取消任务批次超时 job（批次全部任务终态时调用；job 不存在/已完成时静默）。 */
  async cancelTaskTimeout(nodeExecutionId: string): Promise<void> {
    const job = await this.delayQueue.getJob(ProcessEngine.taskTimeoutJobId(nodeExecutionId));
    if (job) await job.remove();
  }

  /**
   * 超时到点处理（delay Worker kind='task_timeout' 调用）。
   * 幂等：批次任务已全部终态时直接返回。动作语义：
   * - AUTO_APPROVE / AUTO_REJECT：对仍 PENDING 的任务逐个以系统身份 completeTask
   *   （复用单人/会签/或签/依次聚合与推进语义；驳回走 rejectToNodeId 既有路径）；
   * - NOTIFY：对仍 PENDING 任务的受理人发催办站内信。
   */
  async handleTaskTimeout(
    instanceId: string,
    nodeId: string,
    nodeExecutionId: string,
  ): Promise<void> {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId },
      include: { processDef: true },
    });
    if (!instance || (instance.status !== 'RUNNING' && instance.status !== 'WAITING_USER_TASK')) {
      return;
    }
    const schema = (instance.frozenWorkflowSchema ?? instance.processDef.workflowSchema) as {
      nodes?: Array<{ id?: string; data?: Record<string, unknown> }>;
    } | null;
    const cfgNode = schema?.nodes?.find((n) => n.id === nodeId);
    // 与 approvalMode 同口径：面板写大写枚举、指南/seed 可写小写——归一化统一
    const action = String(cfgNode?.data?.['timeoutAction'] ?? '').toUpperCase() || undefined;
    if (!action) return;

    const pending = await prisma.processTask.findMany({
      where: { instanceId, nodeId, nodeExecutionId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (pending.length === 0) return;

    if (action === 'NOTIFY') {
      const assignees = pending
        .map((t) => t.assignee)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
      if (assignees.length > 0) {
        // 与 InAppMessageService.create 同形态（避免为一条站内信引入引擎新依赖）
        await prisma.inAppMessage.createMany({
          data: assignees.map((userId) => ({
            tenantId: instance.tenantId,
            appId: instance.processDef.appId,
            userId,
            title: `审批任务超时催办：${pending[0]!.taskName}`,
            body: '您有一条审批任务已超过处理时限，请尽快处理。',
            link: `/tasks`,
          })),
        });
        this.logger.log(`实例 ${instanceId} 节点 ${nodeId} 超时催办已发送 ×${assignees.length}`);
      }
      return;
    }

    if (action === 'AUTO_APPROVE' || action === 'AUTO_REJECT') {
      const decision = action === 'AUTO_APPROVE' ? 'approve' : 'reject';
      const comment = action === 'AUTO_APPROVE' ? '超时自动通过' : '超时自动驳回';
      // 逐个决策：单人一次推进；会签逐个批准到齐后推进；或签首个决策即终结。
      // 按初始待处理数封顶（或签取消兄弟后 findFirst 提前返回 null 自然终止）
      let processed = 0;
      for (let i = 0; i < pending.length; i++) {
        const next = await prisma.processTask.findFirst({
          where: { instanceId, nodeId, nodeExecutionId, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
        });
        if (!next) break;
        try {
          await this.completeTask(
            next.id,
            ProcessEngine.TIMEOUT_ACTOR,
            decision,
            comment,
            undefined,
            instance.tenantId,
          );
          processed += 1;
        } catch (err) {
          // 典型：AUTO_REJECT 但节点无 rejectToNodeId——发布预检已拦，此处兜底留痕不中断
          this.logger.error(
            `实例 ${instanceId} 节点 ${nodeId} 超时动作 ${action} 失败（任务 ${next.id}）：${err instanceof Error ? err.message : String(err)}`,
          );
          break;
        }
      }
      if (processed > 0) {
        this.logger.log(`实例 ${instanceId} 节点 ${nodeId} 超时动作 ${action} 完成 ×${processed}`);
      }
      return;
    }

    this.logger.warn(`实例 ${instanceId} 节点 ${nodeId} 未知超时动作：${action}`);
  }

  // ===========================================================================
  // 辅助：分支汇聚门控（严格 AND-join / OR-join）
  // ===========================================================================

  /** 读取汇聚等待状态（无则返回空对象；返回的是 variables 内的活引用，变更会随实例持久化）。 */
  private getJoinStates(variables: Record<string, unknown>): Record<string, JoinWaitState> {
    return (
      (variables[ProcessEngine.JOIN_STATE_KEY] as Record<string, JoinWaitState> | undefined) ?? {}
    );
  }

  /**
   * 汇聚门控：对每个目标令牌检查是否为已注册的汇聚等待点。
   * - 是且未到齐：暂扣（arrived+1 写回 variables），从激活列表移除
   * - 是且已到齐：清除等待状态，放行
   *
   * @returns 实际激活的节点 ID 列表
   */
  private gateJoinArrivals(variables: Record<string, unknown>, nextNodeIds: string[]): string[] {
    const joins = this.getJoinStates(variables);
    if (Object.keys(joins).length === 0) return nextNodeIds;

    const activated: string[] = [];
    for (const nodeId of nextNodeIds) {
      const state = joins[nodeId];
      if (!state) {
        activated.push(nodeId);
        continue;
      }
      state.arrived += 1;
      if (state.arrived >= state.expected) {
        delete joins[nodeId];
        activated.push(nodeId);
        this.logger.debug(`汇聚点 ${nodeId} 全部 ${state.expected} 个分支令牌已到齐，放行`);
      } else {
        this.logger.debug(
          `汇聚点 ${nodeId} 分支令牌到达 ${state.arrived}/${state.expected}，暂扣等待`,
        );
      }
    }
    // 等待状态清空后移除内部键，保持变量快照干净
    if (Object.keys(joins).length === 0) {
      delete variables[ProcessEngine.JOIN_STATE_KEY];
    }
    return activated;
  }

  /**
   * 注册汇聚等待（并行/包容分支分裂为多个目标时调用）。
   *
   * 经收敛性分析：仅当存在公共汇聚节点且该节点支配所有分支
   * （分支不存在绕过它直达 end/死端的路径）时注册；
   * 否则保持"首达即执行"的历史行为（安全降级，避免令牌发散导致实例卡死）。
   */
  private registerJoinExpectation(
    variables: Record<string, unknown>,
    schema: WorkflowSchema,
    branchStarts: string[],
  ): void {
    if (branchStarts.length < 2) return;

    const joinTarget = this.findStrictJoinTarget(schema, branchStarts);
    if (!joinTarget) {
      this.logger.debug(`分支 [${branchStarts.join(', ')}] 未找到严格汇聚点，保持首达即执行`);
      return;
    }

    const joins = this.getJoinStates(variables);
    joins[joinTarget] = { expected: branchStarts.length, arrived: 0 };
    variables[ProcessEngine.JOIN_STATE_KEY] = joins;
    this.logger.debug(
      `分支 [${branchStarts.join(', ')}] 注册汇聚等待：节点 ${joinTarget}，期望 ${branchStarts.length} 个令牌`,
    );
  }

  /**
   * 严格汇聚点分析：在分支起点的公共可达节点中，
   * 返回支配所有分支的最上游节点（按最大 BFS 深度升序尝试）。
   */
  private findStrictJoinTarget(schema: WorkflowSchema, branchStarts: string[]): string | undefined {
    const reachSets = branchStarts.map((s) => this.computeReachable(schema, s));
    const firstSet = reachSets[0];
    if (!firstSet) return undefined;

    const common = [...firstSet].filter((id) => reachSets.every((set) => set.has(id)));
    if (common.length === 0) return undefined;

    // 候选按"距各分支起点的最大 BFS 深度"升序 → 优先取最上游的公共汇聚节点
    const maxDepth = new Map<string, number>();
    for (const id of common) {
      let depth = 0;
      for (const startId of branchStarts) {
        depth = Math.max(depth, this.bfsDepth(schema, startId, id));
      }
      maxDepth.set(id, depth);
    }
    common.sort((a, b) => (maxDepth.get(a) ?? 0) - (maxDepth.get(b) ?? 0));

    for (const candidate of common) {
      if (this.dominatesAllBranches(schema, branchStarts, candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  /** 计算从 startId 沿边可达的节点集合。 */
  private computeReachable(schema: WorkflowSchema, startId: string): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const edge of schema.edges) {
        if (edge.sourceNodeID !== current) continue;
        if (visited.has(edge.targetNodeID)) continue;
        visited.add(edge.targetNodeID);
        queue.push(edge.targetNodeID);
      }
    }
    return visited;
  }

  /** BFS 求起点到目标的边数距离（不可达返回 Infinity）。 */
  private bfsDepth(schema: WorkflowSchema, startId: string, targetId: string): number {
    if (startId === targetId) return 0;
    const visited = new Set<string>([startId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const edge of schema.edges) {
        if (edge.sourceNodeID !== current.id) continue;
        if (edge.targetNodeID === targetId) return current.depth + 1;
        if (visited.has(edge.targetNodeID)) continue;
        visited.add(edge.targetNodeID);
        queue.push({ id: edge.targetNodeID, depth: current.depth + 1 });
      }
    }
    return Number.POSITIVE_INFINITY;
  }

  /**
   * 支配性检查：删除汇聚点后，每个分支起点都无法到达 end 节点或死端节点
   * （即所有执行路径都必须经过汇聚点）。这是安全激活严格 join 的充分条件。
   */
  private dominatesAllBranches(
    schema: WorkflowSchema,
    branchStarts: string[],
    joinId: string,
  ): boolean {
    return branchStarts.every((startId) => {
      const visited = new Set<string>([startId]);
      const queue: string[] = [startId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) break;
        for (const edge of schema.edges) {
          if (edge.sourceNodeID !== current) continue;
          const target = edge.targetNodeID;
          if (target === joinId || visited.has(target)) continue;
          visited.add(target);
          const node = this.findNode(schema, target);
          // 到达 end 或死端 → 存在绕过汇聚点的路径
          if (!node || node.type === 'end') return false;
          if (schema.edges.every((e) => e.sourceNodeID !== target)) return false;
          queue.push(target);
        }
      }
      return true;
    });
  }

  // ===========================================================================
  // 辅助：子流程同步等待
  // ===========================================================================

  /** 从子流程实例的 triggerContext 提取父实例链接（SubProcessExecutor 同步等待写入）。 */
  private extractParentLink(
    triggerContext: unknown,
  ): { instanceId: string; nodeId: string } | undefined {
    if (!triggerContext || typeof triggerContext !== 'object') return undefined;
    const parent = (triggerContext as Record<string, unknown>)['_parent'];
    if (!parent || typeof parent !== 'object') return undefined;
    const record = parent as Record<string, unknown>;
    const instanceId = record['instanceId'];
    const nodeId = record['nodeId'];
    if (typeof instanceId !== 'string' || typeof nodeId !== 'string') return undefined;
    return { instanceId, nodeId };
  }

  /**
   * 子流程实例完结后恢复父实例的等待节点（子流程同步等待）。
   * - COMPLETED：父节点标记完成 → 令牌推进下游 → 重新入队父实例
   * - FAILED：父节点与父实例同步置 FAILED（避免永久挂起）
   */
  private async resumeParentAfterSubProcess(
    parentInstanceId: string,
    nodeId: string,
    subInstanceId: string,
    subStatus: 'COMPLETED' | 'FAILED',
    error?: string,
  ): Promise<void> {
    try {
      await this.withInstanceLock(parentInstanceId, async () => {
        const parent = await prisma.processInstance.findFirst({
          where: { id: parentInstanceId },
          include: { processDef: true },
        });
        if (!parent) return;
        if (parent.status !== 'RUNNING' && parent.status !== 'WAITING_USER_TASK') return;

        const activeNodeIds = (parent.activeNodeIds as string[]) ?? [];
        if (!activeNodeIds.includes(nodeId)) return;

        if (subStatus === 'FAILED') {
          const errorMsg = `子流程实例 ${subInstanceId} 执行失败${error ? `: ${error}` : ''}`;
          await prisma.$transaction([
            prisma.nodeExecution.updateMany({
              where: { instanceId: parentInstanceId, nodeId, status: 'WAITING' },
              data: { status: 'FAILED', error: errorMsg, finishedAt: new Date() },
            }),
            prisma.processInstance.update({
              where: { id: parentInstanceId },
              data: { status: 'FAILED', error: errorMsg },
            }),
          ]);
          this.logger.error(`父实例 ${parentInstanceId} 因子流程 ${subInstanceId} 失败而失败`);
          return;
        }

        // COMPLETED：写入子流程输出供下游节点引用，完成父节点的 WAITING 执行并推进令牌
        const variables = (parent.variables as Record<string, unknown>) ?? {};
        writeNodeOutput(variables, nodeId, { subInstanceId, status: 'COMPLETED' });
        parent.variables = variables as unknown as Prisma.JsonValue;
        await this.completeWaitingNodeAndAdvance(parent, nodeId);
        this.logger.log(
          `子流程 ${subInstanceId} 完成，父实例 ${parentInstanceId} 节点 ${nodeId} 已恢复`,
        );
      });

      if (subStatus === 'COMPLETED') {
        await this.processQueue.add('execute', { instanceId: parentInstanceId }, DEFAULT_JOB_OPTS);
      }
    } catch (err) {
      // 恢复父实例失败不影响子实例已完成的状态（子流程仍成功）
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`恢复父实例 ${parentInstanceId} 失败: ${msg}`);
    }
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
   *
   * 并行/包容分支分裂为多个目标时，注册汇聚等待（严格 join）：
   * 经收敛性分析找到各分支的公共汇聚节点且该节点支配所有分支路径时，
   * 在 variables._joins 登记 expected，令牌逐个到达时计数，全部到齐放行。
   */
  private resolveNextNodes(
    node: WorkflowNode,
    result: import('./types.js').NodeExecutionResult,
    schema: WorkflowSchema,
    variables: Record<string, unknown>,
  ): string[] {
    let nextNodeIds: string[];
    if (result.nextNodeIds) {
      nextNodeIds = result.nextNodeIds;
    } else {
      nextNodeIds = this.resolveEdgeTargets(schema, node.id, variables);
    }

    if ((node.type === 'parallel' || node.type === 'inclusive') && nextNodeIds.length > 1) {
      this.registerJoinExpectation(variables, schema, nextNodeIds);
    }

    return nextNodeIds;
  }

  /**
   * 推进令牌：移除当前节点令牌，添加下游令牌。
   *
   * 下游令牌经过汇聚门控：若目标节点是已注册的汇聚等待点（_joins），
   * 令牌暂扣（计数 arrived），全部分支到齐后才激活汇聚节点（严格 join）。
   */
  private async advanceTokens(
    instance: InstanceRow,
    currentNodeId: string,
    nextNodeIds: string[],
    variables: Record<string, unknown>,
  ): Promise<InstanceRow> {
    // 移除当前令牌
    const remaining = instance.activeNodeIds.filter((id) => id !== currentNodeId);
    // 汇聚门控：过滤掉暂扣的令牌，放行到齐的汇聚节点
    const activated = this.gateJoinArrivals(variables, nextNodeIds);
    // 添加下游令牌（去重）
    const updated = [...new Set([...remaining, ...activated])];

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
   * 审批结果默认通知（业务用户旅程 R3 2026-10-06）：
   * 流程图未配置任何通知节点时，引擎在审批定论后兜底站内信通知发起人——
   * 反馈环"驳回/通过无通知"的默认链路；配置了通知节点的流程由配置全权
   * 驱动（引擎不重复通知）。收件人=发起人（triggeredByUser/record.created_by），
   * 均无则静默跳过（headless/API 形态无人可通知）。发送失败不阻断审批推进。
   */
  private async notifyInitiatorDefault(
    schema: WorkflowSchema,
    instance: {
      tenantId: string;
      triggerContext: unknown;
      processDef: { appId: string; name: string };
    },
    task: { taskName: string | null },
    isApproved: boolean,
    comment?: string,
  ): Promise<void> {
    const nodes = schema?.nodes ?? [];
    if (nodes.some((n) => n?.type === 'notification')) return; // 配置驱动，不兜底
    const tc = (instance.triggerContext ?? {}) as Record<string, unknown>;
    const record = tc['record'] as Record<string, unknown> | undefined;
    const initiator =
      (tc['triggeredByUser'] as string | undefined) ||
      (record?.['created_by'] as string | undefined) ||
      undefined;
    if (!initiator) return;
    const outcome = isApproved ? '通过' : '驳回';
    const title = `「${instance.processDef.name}」审批已${outcome}`;
    const body = `您发起的「${instance.processDef.name}」在节点「${task.taskName ?? ''}」审批${outcome}${comment ? `，审批意见：${comment}` : ''}。`;
    try {
      await this.inAppMessageService.create({
        tenantId: instance.tenantId,
        appId: instance.processDef.appId,
        userIds: [initiator],
        title,
        body,
        // 深链（评审 P0）：发起人点击直达应用（驳回低谷时刻的行动出口）
        link: `/app/${instance.processDef.appId}`,
      });
      this.logger.log(`默认通知已发送：流程「${instance.processDef.name}」审批${outcome} → 发起人`);
    } catch (err) {
      this.logger.warn(`默认通知发送失败（不阻断审批推进）: ${String(err)}`);
    }
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
        // 深链（评审 P0）：抄送对象多为审批相关人，直达任务中心
        link: '/tasks',
      });

      this.logger.log(`抄送通知已发送：实例节点 ${nodeId}，收件人 ${userIds.length} 人`);
    } catch (err) {
      // 通知发送失败不阻塞流程
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`抄送通知发送失败（节点 ${nodeId}）: ${errorMsg}`);
    }
  }
}
