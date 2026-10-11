/**
 * 流程控制器 — 流程定义/实例/人工任务/通知模版路由。
 *
 * 路由（全局前缀 /api）：
 *   流程定义：
 *     GET    /apps/:appId/processes              — 列出流程
 *     POST   /apps/:appId/processes              — 创建流程
 *     GET    /processes/:processId               — 获取流程
 *     PUT    /processes/:processId               — 更新流程（含 workflowSchema）
 *     DELETE /processes/:processId               — 删除流程
 *     POST   /processes/:processId/publish       — 发布流程
 *
 *   流程实例：
 *     POST   /processes/:processId/start         — 启动流程实例
 *     GET    /processes/:processId/instances     — 列出实例
 *     GET    /instances/mine                     — 列出我发起的实例（任务中心「我发起的」）
 *     GET    /instances/:instanceId              — 获取实例详情
 *     GET    /instances/:instanceId/trace        — 获取流程轨迹（节点状态+连线）
 *     POST   /instances/:instanceId/cancel       — 取消实例
 *
 *   人工任务：
 *     GET    /tasks                              — 列出我的待办
 *     GET    /tasks/:taskId                      — 获取任务详情
 *     POST   /tasks/:taskId/complete             — 完成任务（审批）
 *     POST   /tasks/:taskId/delegate             — 转办
 *
 *   通知模版：
 *     GET    /apps/:appId/notification-templates — 列出模版
 *     POST   /apps/:appId/notification-templates — 创建模版
 *     PUT    /notification-templates/:templateId — 更新模版
 *     DELETE /notification-templates/:templateId — 删除模版
 *
 * 所有路由受 JWT 保护，从 token 提取 tenantId / sub。
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { ProcessService } from './process.service.js';
import { ProcessAnalyticsService } from './process-analytics.service.js';
import { CreateProcessDefDto, UpdateProcessDefDto, StartInstanceDto } from './dto/process.dto.js';
import { CompleteTaskDto, DelegateTaskDto, AddSignDto } from './dto/task.dto.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';

@ApiTags('Process')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class ProcessController {
  constructor(
    private readonly processService: ProcessService,
    private readonly analyticsService: ProcessAnalyticsService,
  ) {}

  // ===========================================================================
  // 流程定义 CRUD
  // ===========================================================================

  // 注意：analytics 字面量路由必须声明在 processes/:processId 之前，否则被参数路由吞掉
  @Get('processes/analytics')
  @RequirePermission('PROCESS', 'VIEW')
  @ApiOperation({ summary: '流程效率分析（平均耗时/完成率/超时数，P1 运维治理）' })
  @ApiQuery({ name: 'appId', required: false, type: String })
  @ApiQuery({ name: 'processDefId', required: false, type: String })
  @ApiQuery({
    name: 'since',
    required: false,
    type: String,
    description: 'ISO 时间下界（按 startedAt）',
  })
  @ApiQuery({ name: 'until', required: false, type: String, description: 'ISO 时间上界' })
  async getAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query('appId') appId?: string,
    @Query('processDefId') processDefId?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const data = await this.analyticsService.getAnalytics({
      tenantId: requireTenantId(req),
      appId: appId || undefined,
      processDefId: processDefId || undefined,
      since: parseDateParam(since),
      until: parseDateParam(until),
    });
    return { ok: true as const, data };
  }

  @Get('apps/:appId/processes')
  @RequirePermission('PROCESS', 'VIEW')
  async listProcesses(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.processService.listProcesses(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post('apps/:appId/processes')
  @RequirePermission('PROCESS', 'CREATE')
  async createProcess(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateProcessDefDto,
  ) {
    const data = await this.processService.createProcess(
      requireTenantId(req),
      appId,
      body,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Get('processes/:processId')
  @RequirePermission('PROCESS', 'VIEW')
  async getProcess(@Req() req: AuthenticatedRequest, @Param('processId') processId: string) {
    const data = await this.processService.getProcess(requireTenantId(req), processId);
    return { ok: true as const, data };
  }

  @Put('processes/:processId')
  @RequirePermission('PROCESS', 'EDIT', 'processId')
  async updateProcess(
    @Req() req: AuthenticatedRequest,
    @Param('processId') processId: string,
    @Body() body: UpdateProcessDefDto,
  ) {
    const data = await this.processService.updateProcess(
      requireTenantId(req),
      processId,
      body,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Delete('processes/:processId')
  @RequirePermission('PROCESS', 'DELETE', 'processId')
  async deleteProcess(@Req() req: AuthenticatedRequest, @Param('processId') processId: string) {
    const data = await this.processService.deleteProcess(
      requireTenantId(req),
      processId,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Post('processes/:processId/publish')
  @RequirePermission('PROCESS', 'EDIT', 'processId')
  async publishProcess(@Req() req: AuthenticatedRequest, @Param('processId') processId: string) {
    const data = await this.processService.publishProcess(
      requireTenantId(req),
      processId,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  // ===========================================================================
  // 流程实例
  // ===========================================================================

  @Post('processes/:processId/start')
  @RequirePermission('PROCESS', 'EXECUTE', 'processId')
  async startInstance(
    @Req() req: AuthenticatedRequest,
    @Param('processId') processId: string,
    @Body() body: StartInstanceDto,
  ) {
    const data = await this.processService.startInstance(
      requireTenantId(req),
      processId,
      body,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Get('processes/:processId/instances')
  @RequirePermission('PROCESS', 'VIEW')
  async listInstances(
    @Req() req: AuthenticatedRequest,
    @Param('processId') processId: string,
    @Query('state') state?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.processService.listInstancesByProcess(
      requireTenantId(req),
      processId,
      state,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
    // 前端期望数组，直接返回 items
    return { ok: true as const, data: result.items };
  }

  // 注意：instances/mine 字面量路由必须声明在 instances/:instanceId 之前，否则被参数路由吞掉
  // （同 processes/analytics 先于 processes/:processId 的既有先例）
  @Get('instances/mine')
  @RequirePermission('PROCESS', 'VIEW')
  @ApiOperation({ summary: '列出我发起的流程实例（任务中心「我发起的」视图）' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: String })
  @ApiQuery({ name: 'pageSize', required: false, type: String })
  async listMyInstances(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.processService.listMyInstances(
      requireTenantId(req),
      req.user.id,
      status,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
    // 前端期望数组，直接返回 items（契约对齐 GET /tasks）
    return { ok: true as const, data: result.items };
  }

  @Get('instances/:instanceId')
  @RequirePermission('PROCESS', 'VIEW')
  async getInstance(@Req() req: AuthenticatedRequest, @Param('instanceId') instanceId: string) {
    const data = await this.processService.getInstance(
      requireTenantId(req),
      instanceId,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Get('instances/:instanceId/trace')
  @RequirePermission('PROCESS', 'VIEW')
  async getTrace(@Req() req: AuthenticatedRequest, @Param('instanceId') instanceId: string) {
    const data = await this.processService.getTrace(requireTenantId(req), instanceId, req.user.id);
    return { ok: true as const, data };
  }

  @Post('instances/:instanceId/cancel')
  @RequirePermission('PROCESS', 'EXECUTE')
  async cancelInstance(@Req() req: AuthenticatedRequest, @Param('instanceId') instanceId: string) {
    const data = await this.processService.cancelInstance(requireTenantId(req), instanceId);
    return { ok: true as const, data };
  }

  // ===========================================================================
  // 人工任务
  // ===========================================================================

  @Get('tasks')
  @RequirePermission('PROCESS', 'VIEW')
  async listTasks(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.processService.listTasks(
      requireTenantId(req),
      req.user.id,
      status,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
    // 前端期望数组，直接返回 items
    return { ok: true as const, data: result.items };
  }

  @Get('tasks/:taskId')
  @RequirePermission('PROCESS', 'VIEW')
  async getTask(@Req() req: AuthenticatedRequest, @Param('taskId') taskId: string) {
    const data = await this.processService.getTask(requireTenantId(req), taskId, req.user.id);
    return { ok: true as const, data };
  }

  @Post('tasks/:taskId/complete')
  @RequirePermission('PROCESS', 'EXECUTE')
  async completeTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: CompleteTaskDto,
  ) {
    const data = await this.processService.completeTask(
      requireTenantId(req),
      taskId,
      req.user.id,
      body.decision,
      body.comment,
      body.formData,
    );
    return { ok: true as const, data };
  }

  @Post('tasks/:taskId/delegate')
  @RequirePermission('PROCESS', 'EXECUTE')
  async delegateTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: DelegateTaskDto,
  ) {
    const data = await this.processService.delegateTask(
      requireTenantId(req),
      taskId,
      req.user.id,
      body.delegatedTo,
    );
    return { ok: true as const, data };
  }

  /** 加签（R1.3）：在当前审批任务上追加审批人（依次补审 / 并行会签）。 */
  @Post('tasks/:taskId/add-sign')
  @RequirePermission('PROCESS', 'EXECUTE')
  async addSign(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: AddSignDto,
  ) {
    const data = await this.processService.addSign(
      requireTenantId(req),
      taskId,
      req.user.id,
      body.userId,
      body.position ?? 'after',
    );
    return { ok: true as const, data };
  }

  /** 撤回流程实例（R1.3）：仅发起人，撤回后全部待办作废、实例 TERMINATED。 */
  @Post('instances/:instanceId/withdraw')
  @RequirePermission('PROCESS', 'EXECUTE')
  async withdrawInstance(
    @Req() req: AuthenticatedRequest,
    @Param('instanceId') instanceId: string,
  ) {
    const data = await this.processService.withdrawInstance(
      requireTenantId(req),
      instanceId,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  // ===========================================================================
  // 通知模版 CRUD
  // ===========================================================================

  @Get('apps/:appId/notification-templates')
  @RequirePermission('PROCESS', 'VIEW')
  async listTemplates(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.processService.listTemplates(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post('apps/:appId/notification-templates')
  @RequirePermission('PROCESS', 'EDIT')
  async createTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateTemplateDto,
  ) {
    const data = await this.processService.createTemplate(requireTenantId(req), appId, body);
    return { ok: true as const, data };
  }

  @Put('notification-templates/:templateId')
  @RequirePermission('PROCESS', 'EDIT')
  async updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('templateId') templateId: string,
    @Body() body: UpdateTemplateDto,
  ) {
    const data = await this.processService.updateTemplate(requireTenantId(req), templateId, body);
    return { ok: true as const, data };
  }

  @Delete('notification-templates/:templateId')
  @RequirePermission('PROCESS', 'EDIT')
  async deleteTemplate(@Req() req: AuthenticatedRequest, @Param('templateId') templateId: string) {
    const data = await this.processService.deleteTemplate(requireTenantId(req), templateId);
    return { ok: true as const, data };
  }
}

/** ISO 日期查询参数解析：非法值忽略（analytics 时间窗）。 */
function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
