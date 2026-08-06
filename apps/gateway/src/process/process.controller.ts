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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { ProcessService } from './process.service.js';
import type {
  CreateProcessDefRequest,
  UpdateProcessDefRequest,
  StartInstanceRequest,
  CreateTemplateRequest,
  UpdateTemplateRequest,
} from './process.service.js';

@ApiTags('Process')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class ProcessController {
  constructor(private readonly processService: ProcessService) {}

  // ===========================================================================
  // 流程定义 CRUD
  // ===========================================================================

  @Get('apps/:appId/processes')
  async listProcesses(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.processService.listProcesses(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post('apps/:appId/processes')
  @RequirePermission('PROCESS', 'CREATE')
  async createProcess(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateProcessDefRequest,
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
  async getProcess(@Req() req: AuthenticatedRequest, @Param('processId') processId: string) {
    const data = await this.processService.getProcess(requireTenantId(req), processId);
    return { ok: true as const, data };
  }

  @Put('processes/:processId')
  @RequirePermission('PROCESS', 'EDIT', 'processId')
  async updateProcess(
    @Req() req: AuthenticatedRequest,
    @Param('processId') processId: string,
    @Body() body: UpdateProcessDefRequest,
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
    const data = await this.processService.publishProcess(requireTenantId(req), processId);
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
    @Body() body: StartInstanceRequest,
  ) {
    const data = await this.processService.startInstance(requireTenantId(req), processId, body);
    return { ok: true as const, data };
  }

  @Get('processes/:processId/instances')
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

  @Get('instances/:instanceId')
  async getInstance(@Req() req: AuthenticatedRequest, @Param('instanceId') instanceId: string) {
    const data = await this.processService.getInstance(requireTenantId(req), instanceId);
    return { ok: true as const, data };
  }

  @Get('instances/:instanceId/trace')
  async getTrace(@Req() req: AuthenticatedRequest, @Param('instanceId') instanceId: string) {
    const data = await this.processService.getTrace(requireTenantId(req), instanceId);
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
  async getTask(@Req() req: AuthenticatedRequest, @Param('taskId') taskId: string) {
    const data = await this.processService.getTask(requireTenantId(req), taskId);
    return { ok: true as const, data };
  }

  @Post('tasks/:taskId/complete')
  async completeTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: { decision: string; comment?: string; formData?: Record<string, unknown> },
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
  async delegateTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: { delegatedTo: string },
  ) {
    const data = await this.processService.delegateTask(
      requireTenantId(req),
      taskId,
      req.user.id,
      body.delegatedTo,
    );
    return { ok: true as const, data };
  }

  // ===========================================================================
  // 通知模版 CRUD
  // ===========================================================================

  @Get('apps/:appId/notification-templates')
  async listTemplates(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.processService.listTemplates(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post('apps/:appId/notification-templates')
  async createTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateTemplateRequest,
  ) {
    const data = await this.processService.createTemplate(requireTenantId(req), appId, body);
    return { ok: true as const, data };
  }

  @Put('notification-templates/:templateId')
  async updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('templateId') templateId: string,
    @Body() body: UpdateTemplateRequest,
  ) {
    const data = await this.processService.updateTemplate(requireTenantId(req), templateId, body);
    return { ok: true as const, data };
  }

  @Delete('notification-templates/:templateId')
  async deleteTemplate(@Req() req: AuthenticatedRequest, @Param('templateId') templateId: string) {
    const data = await this.processService.deleteTemplate(requireTenantId(req), templateId);
    return { ok: true as const, data };
  }
}
