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
} from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import { ProcessInstanceStatus, TaskStatus } from '@apaas/db';
import { ProcessEngine } from './process-engine.js';

// ---------------------------------------------------------------------------
// DTO 类型（创建/更新请求体）
// ---------------------------------------------------------------------------

export interface CreateProcessDefRequest {
  apiName: string;
  name: string;
  workflowSchema: unknown;
  bpmnXml?: string;
  triggerType?: string;
}

export interface UpdateProcessDefRequest {
  name?: string;
  workflowSchema?: unknown;
  bpmnXml?: string;
  triggerType?: string;
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
  constructor(private readonly engine: ProcessEngine) {}

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
        bpmnXml: req.bpmnXml ?? null,
        version: 1,
        status: 'DRAFT',
        triggerType: req.triggerType ?? 'MANUAL',
      },
    });
    return this.toProcessDefDto(def);
  }

  /** 更新流程定义（含 workflowSchema）。 */
  async updateProcess(
    tenantId: string,
    processId: string,
    req: UpdateProcessDefRequest,
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
    }

    const data: Prisma.ProcessDefUpdateInput = {};
    if (req.name !== undefined) data.name = req.name;
    if (req.workflowSchema !== undefined) {
      data.workflowSchema = req.workflowSchema as Prisma.InputJsonValue;
    }
    if (req.bpmnXml !== undefined) data.bpmnXml = req.bpmnXml;
    if (req.triggerType !== undefined) data.triggerType = req.triggerType;

    await prisma.processDef.update({ where: { id: processId }, data });
    return this.getProcess(tenantId, processId);
  }

  /** 删除流程定义（草稿可删，已发布需先归档）。 */
  async deleteProcess(tenantId: string, processId: string) {
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
    return { deleted: true };
  }

  /** 发布流程（版本自增，状态→PUBLISHED）。 */
  async publishProcess(tenantId: string, processId: string) {
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
    return this.toProcessDefDto(def);
  }

  // ===========================================================================
  // 流程实例
  // ===========================================================================

  /** 启动流程实例。 */
  async startInstance(
    tenantId: string,
    processId: string,
    req: StartInstanceRequest,
  ) {
    const triggerContext: Record<string, unknown> = {
      triggerType: 'MANUAL',
      triggeredByUser: req.triggeredByUser ?? null,
      inputs: req.variables ?? {},
    };
    const instanceId = await this.engine.startProcess(
      tenantId,
      processId,
      triggerContext,
    );
    return this.getInstance(tenantId, instanceId);
  }

  /** 获取实例详情。 */
  async getInstance(tenantId: string, instanceId: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: {
        processDef: true,
        nodeExecutions: { orderBy: { startedAt: 'asc' } },
        tasks: true,
      },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    return this.toInstanceDto(instance);
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
    // 前端传入小写状态，需映射为 Prisma 枚举
    const normalizedStatus = status ? status.toUpperCase() : undefined;
    return this.listInstances(tenantId, processId, normalizedStatus, page, pageSize);
  }

  /** 取消实例。 */
  async cancelInstance(tenantId: string, instanceId: string) {
    const instance = await prisma.processInstance.findFirst({
      where: { id: instanceId, tenantId },
    });
    if (!instance) throw new NotFoundException('流程实例不存在');
    await this.engine.cancelProcess(instanceId);
    return { cancelled: true };
  }

  // ===========================================================================
  // 人工任务
  // ===========================================================================

  /** 列出我的待办任务。 */
  async listTasks(
    tenantId: string,
    userId: string,
    status?: string,
    page = 1,
    pageSize = 20,
  ) {
    const where: Prisma.ProcessTaskWhereInput = { tenantId };
    // 我的待办：assignee = userId 或候选组匹配（candidateGroups 存角色ID，需用用户角色匹配）
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
      prisma.orgMember.findMany({ where: { userId }, select: { orgId: true } }),
    ]);
    let roleIds = userRoles.map((r) => r.roleId);
    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) } },
        select: { roleId: true },
      });
      roleIds = [...new Set([...roleIds, ...orgGrants.map((g) => g.roleId)])];
    }

    where.OR = [
      { assignee: userId },
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
  async getTask(tenantId: string, taskId: string) {
    const task = await prisma.processTask.findFirst({
      where: { id: taskId, tenantId },
      include: {
        instance: {
          select: {
            id: true,
            processDef: { select: { name: true, apiName: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
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

    // 权限校验：任务须属于当前用户（受理人或候选组——candidateGroups 存角色ID）
    const isAssignee = task.assignee === userId;
    // 查询用户角色（直接 + 组织授权）
    const [userRoles, orgMembers] = await Promise.all([
      prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
      prisma.orgMember.findMany({ where: { userId }, select: { orgId: true } }),
    ]);
    let roleIds = userRoles.map((r) => r.roleId);
    if (orgMembers.length > 0) {
      const orgGrants = await prisma.orgRoleGrant.findMany({
        where: { orgId: { in: orgMembers.map((m) => m.orgId) } },
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

    await this.engine.completeTask(taskId, userId, decision, comment, formData);
    return { completed: true };
  }

  /** 转办任务给他人。 */
  async delegateTask(
    tenantId: string,
    taskId: string,
    userId: string,
    delegatedTo: string,
  ) {
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
  async createTemplate(
    tenantId: string,
    appId: string,
    req: CreateTemplateRequest,
  ) {
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
    templateId: string,
    req: UpdateTemplateRequest,
  ) {
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

  private toProcessDefDto(d: Prisma.ProcessDefGetPayload<{}>) {
    return {
      id: d.id,
      tenantId: d.tenantId,
      appId: d.appId,
      apiName: d.apiName,
      name: d.name,
      workflowSchema: d.workflowSchema,
      bpmnXml: d.bpmnXml ?? undefined,
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
      triggerContext: i.triggerContext,
      variables: i.variables,
      status: i.status,
      activeNodeIds: i.activeNodeIds,
      startedAt: i.startedAt.toISOString(),
      finishedAt: i.finishedAt?.toISOString(),
      error: i.error ?? undefined,
      processDef: 'processDef' in i ? i.processDef : undefined,
      nodeExecutions: 'nodeExecutions' in i ? i.nodeExecutions : undefined,
      tasks: 'tasks' in i ? i.tasks : undefined,
    };
  }

  private toTemplateDto(t: Prisma.NotificationTemplateGetPayload<{}>) {
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
