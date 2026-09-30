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

  /** 列出应用下流程定义。 */
  async listProcesses(tenantId: string, appId: string) {
    const defs = await prisma.processDef.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return defs.map((d) => this.toProcessDefDto(d));
  }

  /** 获取流程定义。 */
  async getProcess(tenantId: string, processId: string) {
    const def = await prisma.processDef.findFirst({
      where: { id: processId, tenantId },
    });
    if (!def) throw new NotFoundException('流程不存在');
    return this.toProcessDefDto(def);
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
    processId: string,
    req: UpdateProcessDefRequest,
    changedBy?: string,
  ) {
    const existing = await prisma.processDef.findFirst({
      where: { id: processId, tenantId },
    });
    if (!existing) throw new NotFoundException('流程不存在');
    // 已发布流程允许更新,但回退为草稿状态(便于开发迭代)
    // 生产环境应改为"新建版本"逻辑
    if (existing.status === 'PUBLISHED') {
      // 回退为草稿,允许编辑
      await prisma.processDef.update({
        where: { id: processId },
        data: { status: 'DRAFT' },
      });
      // B3 修复：从已发布降级为草稿时取消定时触发器
      void this.triggerService
        .onProcessUnpublished(existing.id, existing.triggerType, existing.cron, existing.apiName)
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

    return this.getProcess(tenantId, processId);
  }

  /** 删除流程定义（草稿可删，已发布需先归档）。 */
  async deleteProcess(tenantId: string, processId: string, changedBy?: string) {
    const existing = await prisma.processDef.findFirst({
      where: { id: processId, tenantId },
    });
    if (!existing) throw new NotFoundException('流程不存在');
    if (existing.status === 'PUBLISHED') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '已发布的流程不可删除，请先归档',
      });
    }

    await prisma.processDef.delete({ where: { id: processId } });

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

  /** 发布流程（版本自增，状态→PUBLISHED）。 */
  async publishProcess(tenantId: string, processId: string, userId?: string) {
    const existing = await prisma.processDef.findFirst({
      where: { id: processId, tenantId },
    });
    if (!existing) throw new NotFoundException('流程不存在');

    const schema = existing.workflowSchema as { nodes?: unknown[] } | null;
    if (!schema || !Array.isArray(schema.nodes) || schema.nodes.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '流程 Schema 为空，无法发布',
      });
    }

    const def = await prisma.processDef.update({
      where: { id: processId },
      data: {
        status: 'PUBLISHED',
        version: { increment: 1 },
      },
    });

    // B3 修复：发布后即时注册定时触发器（此前仅在启动时注册）
    void this.triggerService
      .onProcessPublished(def.id, def.triggerType, def.cron, def.apiName)
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

  /** 启动流程实例。 */
  async startInstance(tenantId: string, processId: string, req: StartInstanceRequest) {
    const triggerContext: Record<string, unknown> = {
      triggerType: 'MANUAL',
      triggeredBy: 'MANUAL',
      triggeredByUser: req.triggeredByUser ?? null,
      inputs: req.variables ?? {},
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
      tasks?: Array<{ assignee?: string | null; candidateUsers?: string[] | null }>;
    },
    viewerId?: string,
  ): Promise<void> {
    if (!viewerId) return; // 内部调用（无请求上下文）不做限制

    const viewer = await prisma.user.findFirst({
      where: { id: viewerId, tenantId },
      select: { isPlatformAdmin: true },
    });
    if (viewer?.isPlatformAdmin) return;

    const roleCodes = await prisma.userRole.findMany({
      where: { userId: viewerId, role: { tenantId } },
      select: { role: { select: { code: true } } },
    });
    if (roleCodes.some((r) => r.role.code === 'TENANT_ADMIN')) return;

    const ctx = (instance.triggerContext ?? {}) as Record<string, unknown>;
    const starter = (ctx['triggeredByUser'] ?? ctx['startedBy'] ?? null) as string | null;
    const isStarter = starter === viewerId;
    const isParticipant = (instance.tasks ?? []).some(
      (t) => t.assignee === viewerId || (t.candidateUsers ?? []).includes(viewerId),
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
    processId: string,
    status?: string,
    page?: number,
    pageSize?: number,
  ) {
    // 前端传入大写状态枚举值（对齐 ProcessInstanceState），直接传给 Prisma 查询
    return this.listInstances(tenantId, processId, status, page, pageSize);
  }

  /** 取消实例。 */
  async cancelInstance(tenantId: string, instanceId: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    await this.engine.cancelProcess(instanceId, tenantId);
    return { cancelled: true };
  }

  // ===========================================================================
  // 人工任务
  // ===========================================================================

  /** 列出我的待办任务。 */
  async listTasks(tenantId: string, userId: string, status?: string, page = 1, pageSize = 20) {
    const where: Prisma.ProcessTaskWhereInput = { tenantId };
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

    where.OR = [
      { assignee: userId },
      ...(user?.email ? [{ assignee: user.email }] : []),
      ...(roleIds.length > 0 ? [{ candidateGroups: { hasSome: roleIds } }] : []),
    ];

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

    const [items, total] = await Promise.all([
      prisma.processTask.findMany({
        where,
        include: {
          instance: {
            select: {
              id: true,
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
            processDef: {
              select: { name: true, apiName: true, workflowSchema: true },
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
    const defSchema = task.instance.processDef.workflowSchema as {
      nodes?: Array<{ id?: string; data?: Record<string, unknown> }>;
    } | null;
    const nodeDef = defSchema?.nodes?.find((n) => n.id === task.nodeId);
    const boundPageId =
      typeof nodeDef?.data?.['pageId'] === 'string' ? (nodeDef.data['pageId'] as string) : null;

    return { ...task, boundPageId };
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
    const isCandidate = roleIds.some((rid) => task.candidateGroups.includes(rid));
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
  async updateTemplate(tenantId: string, templateId: string, req: UpdateTemplateRequest) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, tenantId },
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
  async deleteTemplate(tenantId: string, templateId: string) {
    const existing = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!existing) throw new NotFoundException('通知模版不存在');
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
