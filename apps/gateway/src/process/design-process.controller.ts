/**
 * 流程控制器（设计面）— 流程定义 CRUD / 发布 / 实例监控 / 通知模版（ADR-0005 /design 命名空间）。
 *
 * 路由（全局前缀 /api/v1/design/apps/:appId）：
 *   流程定义：
 *     GET    /processes                         — 列出流程（含草稿）
 *     POST   /processes                         — 创建流程
 *     GET    /processes/:processId              — 获取流程
 *     PUT    /processes/:processId              — 更新流程（含 workflowSchema）
 *     DELETE /processes/:processId              — 删除流程
 *     POST   /processes/:processId/publish      — 发布流程
 *     GET    /processes/:processId/instances    — 实例监控（搭建者视角）
 *
 *   通知模版：
 *     GET    /notification-templates            — 列出模版
 *     POST   /notification-templates            — 创建模版
 *     PUT    /notification-templates/:templateId — 更新模版
 *     DELETE /notification-templates/:templateId — 删除模版
 *
 * 运行面（手动发起 / 实例 / 任务 / 已发布流程列表）在 ProcessController。
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
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { ProcessService } from './process.service.js';
import { CreateProcessDefDto, UpdateProcessDefDto } from './dto/process.dto.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';

@ApiTags('Process (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class DesignProcessController {
  constructor(private readonly processService: ProcessService) {}

  // ===========================================================================
  // 流程定义 CRUD
  // ===========================================================================

  @Get('processes')
  @RequirePermission('PROCESS', 'VIEW')
  async listProcesses(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.processService.listProcesses(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post('processes')
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
  async getProcess(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processId') processId: string,
  ) {
    const data = await this.processService.getProcess(requireTenantId(req), appId, processId);
    return { ok: true as const, data };
  }

  @Put('processes/:processId')
  @RequirePermission('PROCESS', 'EDIT', 'processId')
  async updateProcess(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processId') processId: string,
    @Body() body: UpdateProcessDefDto,
  ) {
    const data = await this.processService.updateProcess(
      requireTenantId(req),
      appId,
      processId,
      body,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Delete('processes/:processId')
  @RequirePermission('PROCESS', 'DELETE', 'processId')
  async deleteProcess(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processId') processId: string,
  ) {
    const data = await this.processService.deleteProcess(
      requireTenantId(req),
      appId,
      processId,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Post('processes/:processId/publish')
  @RequirePermission('PROCESS', 'EDIT', 'processId')
  async publishProcess(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processId') processId: string,
  ) {
    const data = await this.processService.publishProcess(
      requireTenantId(req),
      appId,
      processId,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Get('processes/:processId/instances')
  @RequirePermission('PROCESS', 'VIEW')
  async listInstances(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processId') processId: string,
    @Query('state') state?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.processService.listInstancesByProcess(
      requireTenantId(req),
      appId,
      processId,
      state,
      page ? parseInt(page, 10) : undefined,
      pageSize ? parseInt(pageSize, 10) : undefined,
    );
    // 前端期望数组，直接返回 items
    return { ok: true as const, data: result.items };
  }

  // ===========================================================================
  // 通知模版 CRUD
  // ===========================================================================

  @Get('notification-templates')
  @RequirePermission('PROCESS', 'VIEW')
  async listTemplates(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.processService.listTemplates(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post('notification-templates')
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
    @Param('appId') appId: string,
    @Param('templateId') templateId: string,
    @Body() body: UpdateTemplateDto,
  ) {
    const data = await this.processService.updateTemplate(
      requireTenantId(req),
      appId,
      templateId,
      body,
    );
    return { ok: true as const, data };
  }

  @Delete('notification-templates/:templateId')
  @RequirePermission('PROCESS', 'EDIT')
  async deleteTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('templateId') templateId: string,
  ) {
    const data = await this.processService.deleteTemplate(requireTenantId(req), appId, templateId);
    return { ok: true as const, data };
  }
}
