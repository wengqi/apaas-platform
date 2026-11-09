/**
 * 流程服务 — 流程定义/实例/人工任务/通知模版 CRUD。
 *
 * 对接 ProcessEngine 执行内核：
 * - 流程定义 CRUD（meta 层）
 * - 流程实例 start/get/list/cancel（委托引擎执行）
 * - 人工任务 listTasks/completeTask/delegateTask
 * - 通知模版 CRUD
 *
 * 所有方法基于 tenantId 行级隔离。
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import {
  collectErrorEdgeConflicts,
  collectNodeIssues,
  collectTriggerLoopIssues,
} from '@apaas/shared';
import { findReferencingProcessNames } from '../shared/workflow-schema-refs.js';
import { extractTriggerInfo } from './trigger.service.js';
import { prisma, Prisma } from '@apaas/db';
import { ProcessInstanceStatus, TaskStatus } from '@apaas/db';
import { ProcessEngine } from './process-engine.js';
import { TriggerService } from './trigger.service.js';
import { ChangeLogService } from '../application/changelog.service.js';
import { writeAudit } from '../common/audit.js';

// ---------------------------------------------------------------------------
// DTO 类型（创建/更新请求体）
// ---------------------------------------------------------------------------

export interface CreateProcessDefRequest {
  apiName: string;
  name: string;
  workflowSchema: unknown;
  triggerType?: string;
}

export interface UpdateProcessDefRequest {
  name?: string;
  workflowSchema?: unknown;
  triggerType?: string;
  cron?: string;
}

export interface StartInstanceRequest {
  variables?: Record<string, unknown>;
  triggeredByUser?: string;
}

export interface CreateTemplateRequest {
  name: string;
  channel: string;
  titleTemplate: string;
  bodyTemplate: string;
  variables?: unknown;
}

export interface UpdateTemplateRequest {
  name?: string;
  channel?: string;
  titleTemplate?: string;
  bodyTemplate?: string;
  variables?: unknown;
}

/** PE-01②：引擎保留变量键（启动变量禁入——键黑名单按 ◆1=c 全谱固化）。 */
const ENGINE_RESERVED_VARIABLE_KEYS = ['recordId', 'sequentialIndex', 'global', '_joins'] as const;

/** PE-01①：手动可发起判定（extractTriggerInfo 判定源，MANUAL/SCHEDULED 放行）。 */
function isManualStartableDef(d: {
  workflowSchema: unknown;
  triggerType: string | null;
  cron: string | null;
}): boolean {
  const info = extractTriggerInfo(d.workflowSchema, {
    triggerType: d.triggerType,
    cron: d.cron,
  });
  return info.triggerType === 'MANUAL' || info.triggerType === 'SCHEDULED';
}

@Injectable()
export class ProcessService {
  private readonly logger = new Logger(ProcessService.name);

  constructor(
    private readonly engine: ProcessEngine,
    private readonly changeLogService: ChangeLogService,
    private readonly triggerService: TriggerService,
  ) {}

  // ===========================================================================
  // 流程定义 CRUD
  // ===========================================================================

  /** 列出应用下流程定义（设计面，含草稿）。 */
  async listProcesses(tenantId: string, appId: string) {
    const defs = await prisma.processDef.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return defs.map((d) => this.toProcessDefDto(d));
  }

  /**
   * 列出应用下已发布流程（运行面 GET /apps/:appId/processes，ADR-0005 决策 10③）。
   * 流程级发布语义以活表 status=PUBLISHED 为准（I-1：bundle 不约束流程触发与手动发起）。
   */
  async listPublishedProcesses(tenantId: string, appId: string) {
    const defs = await prisma.processDef.findMany({
      where: { tenantId, appId, status: 'PUBLISHED' },
      orderBy: { updatedAt: 'desc' },
    });
    return defs.map((d) => this.toProcessDefDto(d));
  }

  /** 获取流程定义（设计面）。 */
  async getProcess(tenantId: string, appId: string, processId: string) {
    const def = await this.requireProcessDef(tenantId, appId, processId);
    return this.toProcessDefDto(def);
  }

  /** 断言流程定义存在且属于该应用（租户 + 应用双域隔离，ADR-0005），不存在抛 404。 */
  private async requireProcessDef(tenantId: string, appId: string, processId: string) {
    const def = await prisma.processDef.findFirst({
      where: { id: processId, tenantId, appId },
    });
    if (!def) throw new NotFoundException('流程不存在');
    return def;
  }

  /** 创建流程定义。 */
  async createProcess(
    tenantId: string,
    appId: string,
    req: CreateProcessDefRequest,
    changedBy?: string,
  ) {
    // 校验 apiName 唯一（同应用）
    const existing = await prisma.processDef.findFirst({
      where: { tenantId, appId, apiName: req.apiName },
    });
    if (existing) {
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: `流程 Key "${req.apiName}" 已存在`,
      });
    }

    const def = await prisma.processDef.create({
      data: {
        tenantId,
        appId,
        apiName: req.apiName,
        name: req.name,
        workflowSchema: req.workflowSchema as Prisma.InputJsonValue,
        version: 1,
        status: 'DRAFT',
        triggerType: req.triggerType ?? 'MANUAL',
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'PROCESS',
      entityType: 'ProcessDef',
      entityId: def.id,
      entityName: req.name,
      changeType: 'CREATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `新建流程: ${req.name}`,
    });

    return this.toProcessDefDto(def);
  }

  /** 更新流程定义（含 workflowSchema）。 */
  async updateProcess(
    tenantId: string,
    appId: string,
    processId: string,
    req: UpdateProcessDefRequest,
    changedBy?: string,
  ) {
    const existing = await this.requireProcessDef(tenantId, appId, processId);
    // 已发布流程允许更新,但回退为草稿状态(便于开发迭代)
    // 生产环境应改为"新建版本"逻辑
    if (existing.status === 'PUBLISHED') {
      // PE-07（R-B 波次③，◆4/ADR-0007）：存在生效 API 发布的流程禁止降级编辑
      // （G6 major 冻结契约不被一次保存击穿；退役走主动 retire 端点）
      const activeRelease = await prisma.processApiRelease.findFirst({
        where: { tenantId, processDefId: processId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeRelease) {
        throw new BadRequestException({
          code: 'CONFLICT',
          message:
            '该流程存在生效的 API 发布（ACTIVE major），编辑前请先退役：POST /design/apps/' +
            appId +
            '/processes/' +
            processId +
            '/release/retire',
        });
      }
      // 回退为草稿,允许编辑
      await prisma.processDef.update({
        where: { id: processId },
        data: { status: 'DRAFT' },
      });
      // B3 修复：从已发布降级为草稿时取消定时触发器（I-1：触发信息以 schema 触发节点为 SSOT）
      void this.triggerService
        .onProcessUnpublished(
          existing.id,
          existing.triggerType,
          existing.cron,
          existing.apiName,
          existing.workflowSchema,
        )
        .catch((err) => this.logger.error(`定时触发器取消失败: ${err.message}`));
    }

    const data: Prisma.ProcessDefUpdateInput = {};
    if (req.name !== undefined) data.name = req.name;
    if (req.workflowSchema !== undefined) {
      data.workflowSchema = req.workflowSchema as Prisma.InputJsonValue;
    }
    if (req.triggerType !== undefined) data.triggerType = req.triggerType;
    if (req.cron !== undefined) data.cron = req.cron;

    await prisma.processDef.update({ where: { id: processId }, data });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'PROCESS',
      entityType: 'ProcessDef',
      entityId: processId,
      entityName: req.name ?? existing.name,
      changeType: 'UPDATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `更新流程: ${req.name ?? existing.name}`,
    });

    return this.getProcess(tenantId, appId, processId);
  }

  /** 删除流程定义（草稿可删，已发布需先归档）。 */
  async deleteProcess(tenantId: string, appId: string, processId: string, changedBy?: string) {
    const existing = await this.requireProcessDef(tenantId, appId, processId);
    if (existing.status === 'PUBLISHED') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '已发布的流程不可删除，请先归档',
      });
    }

    // R-B functional-01（◆1=A，2026-11-08 裁决）：存在任何实例即硬拦——删除连带
    // 销毁执行历史（含在途审批与审计留痕），对齐删对象五守卫/P1-09「引用即硬拦」
    // 标准；下线走取消/归档，历史清理留「归档」能力后续立项。
    const instanceCount = await prisma.processInstance.count({
      where: { processDefId: processId, tenantId },
    });
    if (instanceCount > 0) {
      throw new ConflictException(
        `该流程存在 ${instanceCount} 条实例（含在途审批），删除将连带销毁全部执行历史；如需下线请使用取消/归档`,
      );
    }

    // 级联处置该流程的 API release 行（P1-30）：processDefId 无 FK，残留行会让
    // 发现端点继续 advertise 已删流程、调用引擎层 400 悬空——同事务级联删除。
    await prisma.$transaction([
      prisma.processApiRelease.deleteMany({
        where: { tenantId, appId, processDefId: processId },
      }),
      prisma.processDef.delete({ where: { id: processId } }),
    ]);

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'PROCESS',
      entityType: 'ProcessDef',
      entityId: processId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: changedBy ?? 'system',
      changeDescription: `删除流程: ${existing.name}`,
    });

    return { deleted: true };
  }

  /**
   * PE-07（◆4/ADR-0007）：主动退役流程 API 发布——ACTIVE→DEPRECATED（旧 major
   * 对调用方仍可调，退役 ≠ 不可调）。退役后流程恢复可编辑（PUT→DRAFT 闸放行）。
   */
  async retireProcessApiRelease(
    tenantId: string,
    appId: string,
    processId: string,
    userId?: string,
  ) {
    const existing = await this.requireProcessDef(tenantId, appId, processId);
    const result = await prisma.processApiRelease.updateMany({
      where: { tenantId, appId, processDefId: processId, status: 'ACTIVE' },
      data: { status: 'DEPRECATED' },
    });
    if (result.count === 0) {
      throw new BadRequestException('该流程没有生效的 API 发布（ACTIVE），无需退役');
    }
    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'PROCESS',
      entityType: 'ProcessApiRelease',
      entityId: processId,
      entityName: existing.name,
      changeType: 'UPDATE',
      changedBy: userId ?? 'system',
      changeDescription: `退役流程 API 发布（ACTIVE→DEPRECATED）: ${existing.name}`,
    });
    return { retired: true, count: result.count };
  }

  /**
   * PE-07（◆4/ADR-0007）：归档流程——「请先归档」守卫指向的写入点自此可达
   * （守卫链：ACTIVE release 先退役 → 归档 → 删除需过实例守卫）。归档即下线
   * （记录/定时自动化随 PUBLISHED 状态消失）。
   */
  async archiveProcess(tenantId: string, appId: string, processId: string, changedBy?: string) {
    const existing = await this.requireProcessDef(tenantId, appId, processId);
    if (existing.status === 'ARCHIVED') {
      throw new BadRequestException('该流程已归档');
    }
    const activeRelease = await prisma.processApiRelease.findFirst({
      where: { tenantId, appId, processDefId: processId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (activeRelease) {
      throw new BadRequestException(
        '该流程存在生效的 API 发布（ACTIVE），归档前请先退役：POST /design/apps/' +
          appId +
          '/processes/' +
          processId +
          '/release/retire',
      );
    }
    await prisma.processDef.update({
      where: { id: processId },
      data: { status: 'ARCHIVED' },
    });
    if (existing.status === 'PUBLISHED') {
      // I-1 同口径：下线取消定时触发注册
      void this.triggerService
        .onProcessUnpublished(
          existing.id,
          existing.triggerType,
          existing.cron,
          existing.apiName,
          existing.workflowSchema,
        )
        .catch((err) => this.logger.error(`归档取消定时触发失败: ${err.message}`));
    }
    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'PROCESS',
      entityType: 'ProcessDef',
      entityId: processId,
      entityName: existing.name,
      changeType: 'UPDATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `归档流程: ${existing.name}`,
    });
    return { archived: true };
  }

  /** 发布流程（版本自增，状态→PUBLISHED）。 */
  async publishProcess(tenantId: string, appId: string, processId: string, userId?: string) {
    const existing = await this.requireProcessDef(tenantId, appId, processId);

    const schema = existing.workflowSchema as { nodes?: unknown[]; edges?: unknown[] } | null;
    if (!schema || !Array.isArray(schema.nodes) || schema.nodes.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '流程 Schema 为空，无法发布',
      });
    }

    // 发布硬闸（用户反馈 2026-10-06）：节点配置完整性检查——画布"有未完成的
    // 配置"标红与发布预检消费同一份判定（shared collectNodeIssues），
    // 未完成配置的流程保存可以、发布不行。
    const nodeIssues = collectNodeIssues(schema.nodes as Array<Record<string, unknown>>);
    if (nodeIssues.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `流程存在 ${nodeIssues.length} 处未完成的配置，无法发布：${nodeIssues
          .map((i) => `「${i.nodeTitle}」${i.reason}`)
          .join('；')}。请在流程编辑器补全后重试。`,
        issues: nodeIssues as never,
      });
    }

    // PE-08（◆5=预检硬拦）：触发环静态分析——环①对象操作写回触发对象（无界级联）/
    // 环②回写×更新触发（批准后再触发本流程无限循环）
    const loopIssues = collectTriggerLoopIssues(schema.nodes as Array<Record<string, unknown>>);
    if (loopIssues.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `流程存在触发环，无法发布：${loopIssues
          .map((i) => i.message)
          .join('；')}。请调整触发对象或移除写回节点后重试。`,
        issues: loopIssues as never,
      });
    }

    // error 出边歧义硬闸（P1-15）：双 error 边在引擎侧按首条路由——发布前强制唯一
    const edgeConflicts = collectErrorEdgeConflicts(
      (schema.edges ?? []) as Array<{ sourceNodeID: string; targetNodeID: string; label?: string }>,
    );
    if (edgeConflicts.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `流程存在 error 出边歧义，无法发布：${edgeConflicts
          .map(
            (c) =>
              `节点 ${c.sourceNodeId} 有 ${c.conflictingTargets.length} 条 error/失败 出边（→ ${c.conflictingTargets.join('、')}）`,
          )
          .join('；')}。请只保留一条 error/失败 出边。`,
      });
    }

    const def = await prisma.processDef.update({
      where: { id: processId },
      data: {
        status: 'PUBLISHED',
        version: { increment: 1 },
      },
    });

    // B3 修复：发布后即时注册定时触发器（此前仅在启动时注册；I-1：以 schema 触发节点为 SSOT）
    void this.triggerService
      .onProcessPublished(def.id, def.triggerType, def.cron, def.apiName, def.workflowSchema)
      .catch((err) => this.logger.error(`定时触发器注册失败: ${err.message}`));

    // 评审整改：业务动作级审计
    writeAudit({
      tenantId,
      userId: userId ?? '',
      action: 'PROCESS_PUBLISH',
      resource: 'PROCESS',
      resourceId: def.id,
      appId: def.appId,
      detail: { apiName: def.apiName, version: def.version },
    });

    return this.toProcessDefDto(def);
  }

  // ===========================================================================
  // 流程实例
  // ===========================================================================

  /** 启动流程实例。callerUserId=调用方用户身份（A3：显式传入优先，用户上下文兜底注入发起人）。 */
  async startInstance(
    tenantId: string,
    processId: string,
    req: StartInstanceRequest,
    callerUserId?: string,
  ) {
    // PE-01②（R-B，◆1=a+c）：启动变量剥离引擎保留键全谱——recordId（ref 消费）/
    // sequentialIndex（依次审批作用域）/global（作用域）/ _joins（并行汇聚），
    // 防用户注入直达数据面（recordId 借审批流改写任意记录）或跳过审批链
    const inputs: Record<string, unknown> = { ...(req.variables ?? {}) };
    for (const key of ENGINE_RESERVED_VARIABLE_KEYS) delete inputs[key];
    const triggerContext: Record<string, unknown> = {
      triggerType: 'MANUAL',
      triggeredBy: 'MANUAL',
      // A3（专题 R1）：MANUAL 启动兜底注入发起人——studio 只传 {processKey, variables}，
      // 此前 null 导致「我发起的」不可见 / 兜底通知无收件人 / INITIATOR 节点无发起人。
      // PE-03（R-B 波次①）：JWT 用户通道 caller 强制覆盖 body 值（防伪造污染「我发起的」
      // /越权撤回/定向指派 INITIATOR）；显式 triggeredByUser 仅保留给无 caller 身份的
      // 服务身份通道（OpenAPI 直调 engine.startProcess 不经本方法，webhook 两者皆不传）。
      triggeredByUser: callerUserId ?? req.triggeredByUser ?? null,
      inputs,
    };
    const instanceId = await this.engine.startProcess(tenantId, processId, triggerContext);
    return this.getInstance(tenantId, instanceId);
  }

  /** 获取实例详情。 */
  /**
   * 获取实例详情。
   *
   * 评审 M-2：实例变量/触发上下文含敏感业务数据，此前仅校验 PROCESS VIEW
   * （通配规则即通过）→ 同租户内可枚举读取。现要求实例级授权：
   * 平台/租户超管、实例发起人、或该实例任一任务的处理人（含候选人）。
   */
  async getInstance(tenantId: string, instanceId: string, viewerId?: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: {
        processDef: true,
        nodeExecutions: { orderBy: { startedAt: 'asc' } },
        tasks: true,
      },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    await this.assertInstanceVisible(tenantId, instance, viewerId);
    return this.toInstanceDto(instance);
  }

  /** 实例级可见性校验（超管 / 发起人 / 任务参与人）。 */
  private async assertInstanceVisible(
    tenantId: string,
    instance: {
      triggerContext: unknown;
      tasks?: Array<{ assignee?: string | null; candidateGroups?: string[] | null }>;
    },
    viewerId?: string,
  ): Promise<void> {
    if (!viewerId) return; // 内部调用（无请求上下文）不做限制

    const viewer = await prisma.user.findFirst({
      where: { id: viewerId, tenantId },
      select: { isPlatformAdmin: true },
    });
    if (viewer?.isPlatformAdmin) return;

    const roleRows = await prisma.userRole.findMany({
      where: { userId: viewerId, role: { tenantId } },
      select: { role: { select: { id: true, code: true } } },
    });
    if (roleRows.some((r) => r.role.code === 'TENANT_ADMIN')) return;

    const ctx = (instance.triggerContext ?? {}) as Record<string, unknown>;
    const starter = (ctx['triggeredByUser'] ?? ctx['startedBy'] ?? null) as string | null;
    const isStarter = starter === viewerId;
    // R2-A2：任务参与人=受理人 或 候选组命中（角色 ID ∪ 组织 ID）——
    // 原 candidateUsers 读取为不存在列的死代码，随候选组语义扩展一并修正
    const orgMembers = await prisma.orgMember.findMany({
      where: { userId: viewerId, org: { tenantId } },
      select: { orgId: true },
    });
    const candidateIds = new Set([
      ...roleRows.map((r) => r.role.id),
      ...orgMembers.map((m) => m.orgId),
    ]);
    const isParticipant = (instance.tasks ?? []).some(
      (t) => t.assignee === viewerId || (t.candidateGroups ?? []).some((g) => candidateIds.has(g)),
    );
    if (!isStarter && !isParticipant) {
      throw new ForbiddenException('无权查看该流程实例（仅发起人或任务参与人可见）');
    }
  }

  /**
   * 获取流程实例轨迹（WorkflowSchema + 节点执行状态合并）。
   *
   * 返回流程定义的节点/边 + 每个节点的执行状态：
   *   COMPLETED — 已完成（绿色）
   *   RUNNING   — 执行中（蓝色）
   *   WAITING   — 等待人工处理（橙色）
   *   SKIPPED   — 条件分支未命中（灰色半透明）
   *   PENDING   — 尚未到达（灰色）
   */
  async getTrace(tenantId: string, instanceId: string, viewerId?: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: {
        processDef: true,
        nodeExecutions: { orderBy: { startedAt: 'asc' } },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    // 评审 M-2：轨迹同样含执行细节，需实例级可见性
    await this.assertInstanceVisible(
      tenantId,
      instance as unknown as Parameters<ProcessService['assertInstanceVisible']>[1],
      viewerId,
    );

    const schema = instance.processDef.workflowSchema as {
      nodes?: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
      edges?: Array<{ sourceNodeID: string; targetNodeID: string }>;
    };

    const activeNodeIds = (instance.activeNodeIds as string[]) ?? [];

    // 构建节点状态映射
    const nodeStatusMap: Record<
      string,
      {
        status: string;
        startedAt?: string;
        finishedAt?: string;
        error?: string;
      }
    > = {};

    // 从 NodeExecution 记录构建状态
    for (const exec of instance.nodeExecutions) {
      let status = exec.status;
      // 如果节点在 activeNodeIds 中且 NodeExecution 状态为 RUNNING/WAITING，映射为 WAITING（人工任务等待）
      if (activeNodeIds.includes(exec.nodeId) && (status === 'RUNNING' || status === 'WAITING')) {
        status = 'WAITING';
      }
      nodeStatusMap[exec.nodeId] = {
        status,
        startedAt: exec.startedAt?.toISOString(),
        finishedAt: exec.finishedAt?.toISOString(),
        error: exec.error ?? undefined,
      };
    }

    // activeNodeIds 中的节点如果没有 NodeExecution 记录，标记为 RUNNING
    for (const nodeId of activeNodeIds) {
      if (!nodeStatusMap[nodeId]) {
        nodeStatusMap[nodeId] = { status: 'RUNNING' };
      }
    }

    // 所有 schema 中的节点（含嵌套 blocks），未在 nodeStatusMap 中的标记为 PENDING
    const annotateNode = (n: Record<string, unknown>): Record<string, unknown> => ({
      ...n,
      traceStatus: nodeStatusMap[n.id as string]?.status ?? 'PENDING',
      traceStartedAt: nodeStatusMap[n.id as string]?.startedAt,
      traceFinishedAt: nodeStatusMap[n.id as string]?.finishedAt,
      blocks: Array.isArray(n.blocks) ? n.blocks.map(annotateNode) : n.blocks,
    });
    const nodes = (schema.nodes ?? []).map(annotateNode);

    return {
      instance: {
        id: instance.id,
        status: instance.status,
        startedAt: instance.startedAt.toISOString(),
        finishedAt: instance.finishedAt?.toISOString(),
        triggerContext: instance.triggerContext,
        variables: instance.variables,
        activeNodeIds,
      },
      schema: {
        nodes,
        edges: schema.edges ?? [],
      },
      tasks: instance.tasks.map((t) => ({
        id: t.id,
        nodeId: t.nodeId,
        taskName: t.taskName,
        assignee: t.assignee,
        status: t.status,
        decision: t.decision,
        comment: t.comment,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString(),
      })),
    };
  }

  /** 列出实例。 */
  async listInstances(
    tenantId: string,
    processDefId?: string,
    status?: string,
    page = 1,
    pageSize = 20,
  ) {
    const where: Prisma.ProcessInstanceWhereInput = { tenantId };
    if (processDefId) where.processDefId = processDefId;
    if (status) where.status = status as ProcessInstanceStatus;

    const [items, total] = await Promise.all([
      prisma.processInstance.findMany({
        where,
        include: { processDef: { select: { name: true, apiName: true, version: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.processInstance.count({ where }),
    ]);

    return {
      items: items.map((i) => this.toInstanceDto(i)),
      total,
      page,
      pageSize,
    };
  }

  /** 列出某流程定义的实例。 */
  async listInstancesByProcess(
    tenantId: string,
    appId: string,
    processId: string,
    status?: string,
    page?: number,
    pageSize?: number,
  ) {
    // 设计面监控：先断言流程属于路径上的应用（ADR-0005 双域）
    await this.requireProcessDef(tenantId, appId, processId);
    // 前端传入大写状态枚举值（对齐 ProcessInstanceState），直接传给 Prisma 查询
    return this.listInstances(tenantId, processId, status, page, pageSize);
  }

  /**
   * 列出我发起的实例（任务中心「我发起的」视图，2026-10-10）。
   *
   * 发起人归属 = triggerContext.triggeredByUser：记录触发写入记录创建人
   * （trigger.service），手动/API 启动写入 StartInstanceRequest.triggeredByUser。
   * 查询范围天然限定发起人本人，与 getInstance 的 M-2 实例级可见性同语义。
   */
  async listMyInstances(
    tenantId: string,
    userId: string,
    status?: string,
    page = 1,
    pageSize = 20,
  ) {
    const where: Prisma.ProcessInstanceWhereInput = {
      tenantId,
      triggerContext: { path: ['triggeredByUser'], equals: userId },
    };
    if (status) where.status = status as ProcessInstanceStatus;

    const [items, total] = await Promise.all([
      prisma.processInstance.findMany({
        where,
        include: { processDef: { select: { name: true, apiName: true, version: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.processInstance.count({ where }),
    ]);

    return {
      items: items.map((i) => this.toInstanceDto(i)),
      total,
      page,
      pageSize,
    };
  }

  /** 取消实例。 */
  /**
   * PE-01①（R-B，◆1=a+c）：手动启动闸——判定源钉死 extractTriggerInfo（schema 触发
   * 节点 SSOT、顶层列仅回退）。非 MANUAL/SCHEDULED 触发的流程拒绝手动启动
   * （RECORD_CREATED 也可手动启动已被实证为越权链入口）。闸位在 controller 调用点，
   * 不落 engine.startProcess（开放 API/记录/webhook/定时四通道共用该入口）。
   */
  async assertManualStartable(tenantId: string, processId: string): Promise<void> {
    const def = await prisma.processDef.findFirst({ where: { id: processId, tenantId } });
    if (!def) throw new NotFoundException('流程不存在');
    const info = extractTriggerInfo(def.workflowSchema, {
      triggerType: def.triggerType,
      cron: def.cron,
    });
    if (info.triggerType !== 'MANUAL' && info.triggerType !== 'SCHEDULED') {
      throw new BadRequestException(
        `该流程为 ${info.triggerType ?? '未知'} 触发，不支持手动启动（仅手动/定时触发流程可发起）`,
      );
    }
  }

  async cancelInstance(tenantId: string, instanceId: string, userId?: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: { tasks: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    // PE-02（R-B 波次①）：取消不可逆——归属校验对齐实例可见性口径
    // （超管/租户管理员/发起人/任务参与人）；userId 缺省=内部调用不受限
    if (userId) await this.assertInstanceVisible(tenantId, instance, userId);
    await this.engine.cancelProcess(instanceId, tenantId);
    return { cancelled: true };
  }

  // ===========================================================================
  // 人工任务
  // ===========================================================================

  /**
   * functional-06（◆3=A）：监控筛选权限断言——按流程 Id / 他人受理人筛选属
   * 「流程监控」能力，要求租户级 BUILDER/TENANT_ADMIN（平台超管短路）。
   */
  private async assertProcessMonitor(tenantId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { isPlatformAdmin: true },
    });
    if (user?.isPlatformAdmin) return;
    const monitor = await prisma.userRole.findFirst({
      where: { userId, role: { tenantId, code: { in: ['BUILDER', 'TENANT_ADMIN'] } } },
      select: { roleId: true },
    });
    if (!monitor) {
      throw new ForbiddenException(
        '按流程/受理人筛选任务属流程监控能力，需租户级 BUILDER 或管理员角色',
      );
    }
  }

  /** 列出我的待办任务（functional-06：支持 processDefId/assignee 监控筛选）。 */
  async listTasks(
    tenantId: string,
    userId: string,
    status?: string,
    page = 1,
    pageSize = 20,
    processDefId?: string,
    assignee?: string,
  ) {
    const where: Prisma.ProcessTaskWhereInput = { tenantId };

    // ◆3=A：跨人/跨流程筛选（assignee 非本人或指定流程）→ 要求监控角色；本人筛选不要求
    if (processDefId || (assignee !== undefined && assignee !== userId)) {
      await this.assertProcessMonitor(tenantId, userId);
    }
    // 我的待办：assignee = userId 或候选组匹配（candidateGroups 存角色ID，需用用户角色匹配）
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({ where: { userId, role: { tenantId } }, select: { roleId: true } }),
      prisma.orgMember.findMany({ where: { userId, org: { tenantId } }, select: { orgId: true } }),
    ]);
    let roleIds = userRoles.map((r) => r.roleId);
    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) }, orgNode: { tenantId } },
        select: { roleId: true },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
    }

    // 查找用户邮箱（assignee 可能存的是邮箱而非 userId）
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { email: true },
    });

    // R2-A2：candidateGroups 语义扩展为「角色 ID 或组织 ID」（组织审批节点存组织 ID），
    // 按「用户的角色 ∪ 用户直接所属组织」匹配（组织授权角色已在上方并入 roleIds）
    const orgIds = orgMembers.map((m) => m.orgId);
    const candidateGroupIds = [...new Set([...roleIds, ...orgIds])];

    // functional-06：监控筛选——指定 assignee 时精确匹配该受理人（值可为 userId 或
    // 邮箱，与存储口径一致）；否则保持「我的任务」候选组语义
    if (assignee !== undefined) {
      where.OR = [{ assignee }];
    } else {
      where.OR = [
        { assignee: userId },
        ...(user?.email ? [{ assignee: user.email }] : []),
        ...(candidateGroupIds.length > 0
          ? [{ candidateGroups: { hasSome: candidateGroupIds } }]
          : []),
      ];
    }

    // functional-06：按流程定义过滤（监控语义；任务经 instance 关联流程）
    if (processDefId) {
      where.instance = { processDefId };
    }

    // 前端传入小写 status（pending/completed），需要映射为 Prisma 枚举值
    if (status) {
      const statusMap: Record<string, TaskStatus[]> = {
        pending: ['PENDING'],
        completed: ['APPROVED', 'REJECTED', 'DELEGATED', 'CANCELLED'],
      };
      const mapped = statusMap[status.toLowerCase()];
      if (mapped) {
        where.status = { in: mapped };
      } else {
        // 直接作为枚举值使用（兼容大写传入）
        where.status = status.toUpperCase() as TaskStatus;
      }
    }

    const [rawItems, total] = await Promise.all([
      prisma.processTask.findMany({
        where,
        include: {
          instance: {
            select: {
              id: true,
              triggerContext: true,
              processDef: { select: { name: true, apiName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.processTask.count({ where }),
    ]);

    // 映射为 shared UserTask 契约（QA D-013 修复：此前返回原始 Prisma 行，
    // 缺 starter/arrivedAt/processName——监控页任务列表与处理面板三列全 "—"）。
    // dueAt：截止时间配置（UserTaskConfig.dueDate）尚未持久化到任务行，诚实留空。
    // 注：`...t` 会携带 instance.triggerContext 全量（含 record 快照）——
    // 可见者已被 where 限定为 发起人/参与人/管理员，任务面板本就展示申请内容，
    // 暴露面与既有任务详情（getTask）一致（OCR 评审 M1 已评估）。
    const items = rawItems.map((t) => ({
      ...t,
      processName: t.instance?.processDef?.name ?? undefined,
      starter:
        ((t.instance?.triggerContext as Record<string, unknown> | null)?.['triggeredByUser'] as
          string | undefined) ?? undefined,
      arrivedAt: t.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize };
  }

  /** 获取任务详情。 */
  async getTask(tenantId: string, taskId: string, userId?: string) {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId, tenantId },
      include: {
        instance: {
          select: {
            id: true,
            status: true,
            variables: true,
            triggerContext: true,
            environmentId: true,
            frozenWorkflowSchema: true,
            processDef: {
              select: { name: true, apiName: true, appId: true, workflowSchema: true },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('任务不存在');

    // B9 修复：getTask 返回 instance.variables + triggerContext 等敏感数据，
    // 必须校验调用者是任务的 assignee 或 candidate-group 成员
    if (userId) {
      await this.assertTaskMembership(task, userId);
    }

    // R1.3 审批页面绑定：从流程定义 WorkflowSchema 中读取该节点绑定的页面 ID。
    // 一切界面皆页面（ADR-0003）：user_task 绑定的是页面，可含表单或关联信息；
    // 未绑定返回 null，任务中心回退默认审批 UI。
    // R1.4：优先实例启动时冻结的 schema（在途实例不受版本切换影响）
    const defSchema = (task.instance.frozenWorkflowSchema ??
      task.instance.processDef.workflowSchema) as {
      nodes?: Array<{ id?: string; data?: Record<string, unknown> }>;
    } | null;
    const nodeDef = defSchema?.nodes?.find((n) => n.id === task.nodeId);
    // 交互评审（2026-10-04）修复：UI 曾把绑定页写入 formKey（契约外字段名，
    // 引擎/MCP 均为 pageId）导致审批页绑定对 UI 搭建的流程静默失效——
    // pageId 为准，formKey 仅回退在途草稿实例的冻结 schema。
    const boundPageId =
      typeof nodeDef?.data?.['pageId'] === 'string'
        ? (nodeDef.data['pageId'] as string)
        : typeof nodeDef?.data?.['formKey'] === 'string'
          ? (nodeDef.data['formKey'] as string)
          : null;

    // #16：节点是否允许驳回（undefined=允许），任务中心据此禁用拒绝按钮
    const allowReject = nodeDef?.data?.['allowReject'] !== false;
    // 语义裁决（2026-10-06）：未配置驳回跳转的节点运行时不提供驳回操作——
    // 任务中心据此隐藏拒绝按钮（与引擎硬闸同口径）
    const rejectConfigured =
      typeof nodeDef?.data?.['rejectToNodeId'] === 'string' &&
      (nodeDef.data['rejectToNodeId'] as string).trim() !== '';

    // #15：申请内容字段标签（apiName→label）——未绑定审批页时任务中心
    // 用它把 triggerContext.inputs 从裸 key 渲染成友好键值表
    const triggerObjectId = (task.instance.triggerContext as Record<string, unknown>)?.[
      'objectId'
    ] as string | undefined;
    let inputFieldLabels: Record<string, string> | undefined;
    if (triggerObjectId) {
      const obj = await prisma.objectMeta.findFirst({
        where: { id: triggerObjectId, tenantId },
        select: { fields: true },
      });
      const fields = (obj?.fields as Array<{ apiName?: string; label?: string }> | null) ?? [];
      if (fields.length > 0) {
        inputFieldLabels = Object.fromEntries(
          fields
            .filter((f) => f.apiName)
            .map((f) => [f.apiName as string, f.label ?? (f.apiName as string)]),
        );
      }
    }

    // 交互评审（2026-10-04）P0：申请内容"创建人"解析姓名——审批人不应看到裸 cuid
    const triggerInputs = (task.instance.triggerContext as Record<string, unknown>)?.['inputs'] as
      Record<string, unknown> | undefined;
    const rawCreator = triggerInputs?.['created_by'];
    const creatorId =
      typeof rawCreator === 'string'
        ? rawCreator
        : Array.isArray(rawCreator) && typeof rawCreator[0] === 'string'
          ? (rawCreator[0] as string)
          : undefined;
    let recordCreatorName: string | undefined;
    if (creatorId) {
      const creator = await prisma.user.findUnique({
        where: { id: creatorId },
        select: { name: true },
      });
      recordCreatorName = creator?.name ?? undefined;
    }

    // R1.4：审批页按环境 bundle 渲染所需上下文
    return {
      ...task,
      boundPageId,
      allowReject,
      rejectConfigured,
      inputFieldLabels,
      recordCreatorName,
      appId: task.instance.processDef.appId,
      runtimeEnv: task.instance.environmentId,
    };
  }

  /** 完成任务（审批）。 */
  async completeTask(
    tenantId: string,
    taskId: string,
    userId: string,
    decision: string,
    comment?: string,
    formData?: Record<string, unknown>,
  ) {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId, tenantId },
    });
    if (!task) throw new NotFoundException('任务不存在');

    await this.assertTaskMembership(task, userId);

    await this.engine.completeTask(taskId, userId, decision, comment, formData, tenantId);
    return { completed: true };
  }

  /** 转办任务给他人。 */
  async delegateTask(tenantId: string, taskId: string, userId: string, delegatedTo: string) {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId, tenantId },
    });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: '任务已完成或已取消',
      });
    }

    // 权限校验：仅任务受理人/候选组成员可转办
    await this.assertTaskMembership(task, userId);

    // 被转办人必须是同租户下的有效用户
    const delegateUser = await prisma.user.findFirst({
      where: { id: delegatedTo, tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, email: true },
    });
    if (!delegateUser) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '被转办人不存在或不属于当前租户',
      });
    }

    await prisma.processTask.update({
      where: { id: taskId },
      data: {
        status: 'DELEGATED',
        delegatedTo,
        comment: `由 ${userId} 转办给 ${delegatedTo}`,
      },
    });

    // 创建新的待办任务给被转办人（保持流程继续）
    await prisma.processTask.create({
      data: {
        tenantId,
        instanceId: task.instanceId,
        nodeExecutionId: task.nodeExecutionId,
        nodeId: task.nodeId,
        taskName: task.taskName,
        assignee: delegatedTo,
        candidateGroups: [],
        status: 'PENDING',
      },
    });

    return { delegated: true, delegatedTo };
  }

  /**
   * 撤回流程实例（R1.3）——发起人撤回仍在审批中的实例。
   * 权限：仅实例发起人（triggerContext.triggeredByUser / startedBy）可撤回；
   * 语义：复用 cancelProcess（全部待办作废，实例 TERMINATED），撤回不可逆。
   */
  async withdrawInstance(tenantId: string, instanceId: string, userId: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
      select: { id: true, status: true, triggerContext: true },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');

    const triggerCtx = (instance.triggerContext as Record<string, unknown> | null) ?? {};
    const initiator =
      typeof triggerCtx['triggeredByUser'] === 'string'
        ? (triggerCtx['triggeredByUser'] as string)
        : typeof triggerCtx['startedBy'] === 'string'
          ? (triggerCtx['startedBy'] as string)
          : null;
    if (!initiator || initiator !== userId) {
      throw new ForbiddenException('仅流程发起人可撤回');
    }
    if (instance.status !== 'RUNNING' && instance.status !== 'WAITING_USER_TASK') {
      throw new BadRequestException({ code: 'CONFLICT', message: '流程已结束或已取消，无法撤回' });
    }

    await this.engine.cancelProcess(instanceId, tenantId);
    return { withdrawn: true };
  }

  /**
   * 加签（R1.3）——在当前审批任务上临时追加审批人。
   * - after（默认）：在被签人之后依次补审——将目标用户插入该节点 approveUsers
   *   当前进度位之后，并把新任务排在当前批次完成后生成（sequential 语义扩展）。
   * - parallel：立即为目标用户创建并行 PENDING 任务（并入会签批次）。
   * 权限：仅当前任务受理人可加签。
   */
  async addSign(
    tenantId: string,
    taskId: string,
    userId: string,
    addUserId: string,
    position: 'after' | 'parallel',
  ) {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId, tenantId },
      include: { instance: { include: { processDef: true } } },
    });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'PENDING') {
      throw new BadRequestException({ code: 'CONFLICT', message: '任务已完成或已取消' });
    }
    await this.assertTaskMembership(task, userId);

    const addSignUser = await prisma.user.findFirst({
      where: { id: addUserId, tenantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!addSignUser) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '加签用户不存在或已停用',
      });
    }

    if (position === 'parallel') {
      // PE-04（◆3）：节点批次已定论 → 拒绝加签（残留任务会成为相反决策入口）
      const finalizedExec =
        (await prisma.nodeExecution.findFirst({
          where: {
            instanceId: task.instanceId,
            nodeId: task.nodeId,
            status: 'COMPLETED',
          },
          select: { id: true },
        })) ?? null;
      if (finalizedExec) {
        throw new BadRequestException({
          code: 'CONFLICT',
          message: '该审批节点已定论，不可再加签',
        });
      }
      // 并行加签：直接并入当前批次（会签语义下与既有 PENDING 一起等齐）
      await prisma.processTask.create({
        data: {
          tenantId,
          instanceId: task.instanceId,
          nodeExecutionId: task.nodeExecutionId,
          nodeId: task.nodeId,
          taskName: task.taskName,
          assignee: addUserId,
          candidateGroups: [],
          status: 'PENDING',
        },
      });
      return { added: true, position, assignee: addUserId };
    }

    // PE-05（R-B 波次②，◆2=保留 after 链实例级存储）：加签链存实例级
    // variables 专用键 `_addSign:<nodeId>`（完整有序名单，completeTask 顺序分支
    // 消费），不再写 ProcessDef——治理基线（快照/活表）不可被运行期动作改写；
    // PE-06 冻结读源后写活表对在途实例本就不再生效。仅依次（sequential）节点
    // 支持 after——非依次模式 after 此前改定义但运行时不消费（只污染），改 400
    // 指引 parallel（◆2 评审轮注：行为差异开工定）。
    const instanceVars = (task.instance.variables as Record<string, unknown> | null) ?? {};
    const overrideKey = `_addSign:${task.nodeId}`;
    const frozenSchema = (task.instance.frozenWorkflowSchema ??
      task.instance.processDef.workflowSchema) as {
      nodes?: Array<{ id?: string; data?: Record<string, unknown> }>;
    } | null;
    const nodeDef = frozenSchema?.nodes?.find((n) => n.id === task.nodeId);
    const approvalMode = String(nodeDef?.data?.['approvalMode'] ?? 'single').toLowerCase();
    if (approvalMode !== 'sequential') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '依次加签（after）仅支持依次审批节点；并行/会签场景请使用并行加签（parallel）',
      });
    }

    const nodeScope = (instanceVars[task.nodeId] as Record<string, unknown> | undefined) ?? {};
    const currentIdx =
      typeof nodeScope['sequentialIndex'] === 'number'
        ? (nodeScope['sequentialIndex'] as number)
        : 0;
    const baseUsers = Array.isArray(nodeDef?.data?.['approveUsers'])
      ? ([...((nodeDef?.data?.['approveUsers'] as string[]) ?? [])] as string[])
      : [userId];
    const users = (
      Array.isArray(instanceVars[overrideKey]) ? (instanceVars[overrideKey] as string[]) : baseUsers
    ).slice();
    if (!users.includes(addUserId)) {
      users.splice(currentIdx + 1, 0, addUserId);
      await prisma.processInstance.update({
        where: { id: task.instance.id },
        data: {
          variables: { ...instanceVars, [overrideKey]: users } as Prisma.InputJsonValue,
        },
      });
      // 补审计（PE-05 工单：治理动作留痕）+ changelog
      writeAudit({
        tenantId,
        userId,
        action: 'PROCESS_ADD_SIGN',
        resource: 'PROCESS',
        resourceId: task.instance.processDefId,
        appId: task.instance.processDef?.appId,
        detail: { instanceId: task.instance.id, nodeId: task.nodeId, addUserId, position },
      });
      await this.changeLogService.log({
        tenantId,
        appId: task.instance.processDef?.appId ?? '',
        module: 'PROCESS',
        entityType: 'ProcessDef',
        entityId: task.instance.processDefId,
        entityName: task.instance.processDef?.name ?? task.instance.processDefId,
        changeType: 'UPDATE',
        changedBy: userId,
        changeDescription: `在途实例依次加签（实例级，不改定义）: ${task.nodeId} += ${addUserId}`,
      });
    }

    // 依次语义下加签人的后续任务由 completeTask 推进时按 `_addSign:<nodeId>`
    // 名单生成（引擎顺序分支消费实例级名单优先于冻结定义）。
    return { added: true, position, approveUsers: users };
  }

  /**
   * 校验当前用户是否为任务的受理人或候选组成员。
   * assignee 可能存 userId 或邮箱，均需匹配；candidateGroups 存角色 ID（含组织授权）。
   */
  private async assertTaskMembership(
    task: { assignee: string | null; candidateGroups: string[]; tenantId: string },
    userId: string,
  ): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { email: true },
    });
    const isAssignee =
      task.assignee === userId || (user?.email != null && task.assignee === user.email);
    // 查询用户角色（直接 + 组织授权）
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({
        where: { userId, role: { tenantId: task.tenantId } },
        select: { roleId: true },
      }),
      prisma.orgMember.findMany({
        where: { userId, org: { tenantId: task.tenantId } },
        select: { orgId: true },
      }),
    ]);
    let roleIds = userRoles.map((r) => r.roleId);
    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: {
          orgId: { in: orgMembers.map((m) => m.orgId) },
          orgNode: { tenantId: task.tenantId },
        },
        select: { roleId: true },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
    }
    // R2-A2：candidateGroups 语义扩展为「角色 ID 或组织 ID」——候选组命中
    // 「用户的角色（含组织授权）∪ 用户直接所属组织」
    const candidateIds = [...new Set([...roleIds, ...orgMembers.map((m) => m.orgId)])];
    const isCandidate = candidateIds.some((gid) => task.candidateGroups.includes(gid));
    if (!isAssignee && !isCandidate) {
      throw new BadRequestException({
        code: 'FORBIDDEN',
        message: '任务不属于当前用户',
      });
    }
  }

  // ===========================================================================
  // 通知模版 CRUD
  // ===========================================================================

  /** 列出通知模版。 */
  async listTemplates(tenantId: string, appId: string) {
    const templates = await prisma.notificationTemplate.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return templates.map((t) => this.toTemplateDto(t));
  }

  /** 获取模版详情。 */
  async getTemplate(tenantId: string, templateId: string) {
    const template = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) throw new NotFoundException('通知模版不存在');
    return this.toTemplateDto(template);
  }

  /** 创建模版。 */
  async createTemplate(tenantId: string, appId: string, req: CreateTemplateRequest) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { tenantId, appId, name: req.name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: `模版名 "${req.name}" 已存在`,
      });
    }

    const template = await prisma.notificationTemplate.create({
      data: {
        tenantId,
        appId,
        name: req.name,
        channel: req.channel,
        titleTemplate: req.titleTemplate,
        bodyTemplate: req.bodyTemplate,
        variables: (req.variables ?? []) as Prisma.InputJsonValue,
      },
    });
    return this.toTemplateDto(template);
  }

  /** 更新模版。 */
  async updateTemplate(
    tenantId: string,
    appId: string,
    templateId: string,
    req: UpdateTemplateRequest,
  ) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('通知模版不存在');

    const data: Prisma.NotificationTemplateUpdateInput = {};
    if (req.name !== undefined) data.name = req.name;
    if (req.channel !== undefined) data.channel = req.channel;
    if (req.titleTemplate !== undefined) data.titleTemplate = req.titleTemplate;
    if (req.bodyTemplate !== undefined) data.bodyTemplate = req.bodyTemplate;
    if (req.variables !== undefined) {
      data.variables = req.variables as Prisma.InputJsonValue;
    }

    await prisma.notificationTemplate.update({
      where: { id: templateId },
      data,
    });
    return this.getTemplate(tenantId, templateId);
  }

  /** 删除模版。 */
  async deleteTemplate(tenantId: string, appId: string, templateId: string) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('通知模版不存在');

    // R-B functional-05：模版被流程 notification 节点引用时硬拦（引用即硬拦标准，
    // 引用清单直出流程名；预检只拦未来提交，删除闸防存量引用悬空）
    const defs =
      (await prisma.processDef.findMany({
        where: { tenantId, appId },
        select: { name: true, workflowSchema: true },
      })) ?? [];
    const referencing = findReferencingProcessNames(defs, (refs) =>
      refs.templateIds.has(templateId),
    );
    if (referencing.length > 0) {
      throw new ConflictException(
        `通知模版「${existing.name}」被以下流程引用，无法删除：${referencing.join('、')}`,
      );
    }

    await prisma.notificationTemplate.delete({ where: { id: templateId } });
    return { deleted: true };
  }

  // ===========================================================================
  // DTO 映射
  // ===========================================================================

  private toProcessDefDto(d: Prisma.ProcessDefGetPayload<Record<string, unknown>>) {
    return {
      id: d.id,
      tenantId: d.tenantId,
      appId: d.appId,
      apiName: d.apiName,
      // @deprecated processKey — 兼容前端旧引用，值同 apiName
      processKey: d.apiName,
      name: d.name,
      workflowSchema: d.workflowSchema,
      version: d.version,
      status: d.status,
      triggerType: d.triggerType ?? undefined,
      // PE-01①：运行面手动发起清单过滤依据（触发节点判定，顶层列回退）
      manualStartable: isManualStartableDef(d),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  private toInstanceDto(
    i:
      | Prisma.ProcessInstanceGetPayload<{
          include: {
            processDef: true;
            nodeExecutions: true;
            tasks: true;
          };
        }>
      | Prisma.ProcessInstanceGetPayload<{
          include: { processDef: { select: { name: true; apiName: true; version: true } } };
        }>,
  ) {
    return {
      id: i.id,
      tenantId: i.tenantId,
      processDefId: i.processDefId,
      processKey: 'processDef' in i ? i.processDef.apiName : undefined,
      version: 'processDef' in i ? i.processDef.version : undefined,
      triggerContext: i.triggerContext,
      variables: i.variables,
      // 映射 Prisma status → 前端 state（小写枚举值）
      state: this.mapInstanceState(i.status),
      status: i.status,
      activeNodeIds: i.activeNodeIds,
      startedAt: i.startedAt.toISOString(),
      startTime: i.startedAt.toISOString(),
      endTime: i.finishedAt?.toISOString(),
      finishedAt: i.finishedAt?.toISOString(),
      error: i.error ?? undefined,
      triggeredBy: (i.triggerContext as Record<string, unknown> | null)?.['triggeredBy'] as
        string | undefined,
      triggeredByUser: (i.triggerContext as Record<string, unknown> | null)?.['triggeredByUser'] as
        string | undefined,
      processDef: 'processDef' in i ? i.processDef : undefined,
      nodeExecutions: 'nodeExecutions' in i ? i.nodeExecutions : undefined,
      tasks: 'tasks' in i ? i.tasks : undefined,
    };
  }

  /** Prisma status → 前端 state 映射（对齐 ProcessInstanceState 枚举）。 */
  private mapInstanceState(status: string): string {
    const map: Record<string, string> = {
      RUNNING: 'RUNNING',
      WAITING_USER_TASK: 'WAITING_USER_TASK',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      TERMINATED: 'TERMINATED',
    };
    return map[status] ?? 'RUNNING';
  }

  private toTemplateDto(t: Prisma.NotificationTemplateGetPayload<Record<string, unknown>>) {
    return {
      id: t.id,
      tenantId: t.tenantId,
      appId: t.appId,
      name: t.name,
      channel: t.channel,
      titleTemplate: t.titleTemplate,
      bodyTemplate: t.bodyTemplate,
      variables: t.variables,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
