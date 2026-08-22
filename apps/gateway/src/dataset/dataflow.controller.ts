/**
 * 数据流控制器 — 数据流 CRUD + 执行 + 预览。
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { DataFlowService } from './dataflow.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import type { CreateDataFlowRequest, UpdateDataFlowRequest } from '@apaas/shared';

@ApiTags('DataFlow')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class DataFlowController {
  constructor(private readonly dataFlowService: DataFlowService) {}

  @Get('apps/:appId/data-flows')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const flows = await this.dataFlowService.list(requireTenantId(req), appId);
    return { ok: true as const, data: flows };
  }

  @Get('data-flows/:flowId')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async get(@Req() req: AuthenticatedRequest, @Param('flowId') flowId: string) {
    const flow = await this.dataFlowService.get(requireTenantId(req), flowId);
    return { ok: true as const, data: flow };
  }

  @Post('apps/:appId/data-flows')
  @RequirePermission('DATA_MODEL', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateDataFlowRequest,
  ) {
    const flow = await this.dataFlowService.create(requireTenantId(req), appId, req.user.id, body);
    return { ok: true as const, data: flow };
  }

  @Put('data-flows/:flowId')
  @RequirePermission('DATA_MODEL', 'EDIT')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('flowId') flowId: string,
    @Body() body: UpdateDataFlowRequest,
  ) {
    const flow = await this.dataFlowService.update(requireTenantId(req), flowId, req.user.id, body);
    return { ok: true as const, data: flow };
  }

  @Delete('data-flows/:flowId')
  @RequirePermission('DATA_MODEL', 'DELETE')
  async delete(@Req() req: AuthenticatedRequest, @Param('flowId') flowId: string) {
    await this.dataFlowService.delete(requireTenantId(req), flowId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post('data-flows/:flowId/preview')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async preview(@Req() req: AuthenticatedRequest, @Param('flowId') flowId: string) {
    const result = await this.dataFlowService.preview(requireTenantId(req), flowId);
    return { ok: true as const, data: result };
  }

  @Post('data-flows/:flowId/execute')
  @RequirePermission('DATA_MODEL', 'EXECUTE')
  async execute(@Req() req: AuthenticatedRequest, @Param('flowId') flowId: string) {
    const datasetId = await this.dataFlowService.execute(requireTenantId(req), flowId);
    return { ok: true as const, data: { datasetId } };
  }
}
