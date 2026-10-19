/**
 * 数据流控制器（设计面）— 数据流 CRUD + 预览 + 执行（ADR-0005 /design 命名空间，嵌套在应用下）。
 * 数据流是搭建期配置，无运行面；物化结果经运行面 /datasets/:id[/rows] 读取。
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { DataFlowService } from './dataflow.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { CreateDataFlowDto, UpdateDataFlowDto } from './dto/dataflow.dto.js';

@ApiTags('DataFlow (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/data-flows')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class DesignDataFlowController {
  constructor(private readonly dataFlowService: DataFlowService) {}

  @Get()
  @RequirePermission('DATA_MODEL', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const flows = await this.dataFlowService.list(requireTenantId(req), appId);
    return { ok: true as const, data: flows };
  }

  @Get(':flowId')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('flowId') flowId: string,
  ) {
    const flow = await this.dataFlowService.get(requireTenantId(req), appId, flowId);
    return { ok: true as const, data: flow };
  }

  @Post()
  @RequirePermission('DATA_MODEL', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateDataFlowDto,
  ) {
    const flow = await this.dataFlowService.create(requireTenantId(req), appId, req.user.id, body);
    return { ok: true as const, data: flow };
  }

  @Put(':flowId')
  @RequirePermission('DATA_MODEL', 'EDIT')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('flowId') flowId: string,
    @Body() body: UpdateDataFlowDto,
  ) {
    const flow = await this.dataFlowService.update(
      requireTenantId(req),
      appId,
      flowId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: flow };
  }

  @Delete(':flowId')
  @RequirePermission('DATA_MODEL', 'DELETE')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('flowId') flowId: string,
  ) {
    await this.dataFlowService.delete(requireTenantId(req), appId, flowId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post(':flowId/preview')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async preview(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('flowId') flowId: string,
  ) {
    const result = await this.dataFlowService.preview(requireTenantId(req), appId, flowId);
    return { ok: true as const, data: result };
  }

  @Post(':flowId/execute')
  @RequirePermission('DATA_MODEL', 'EXECUTE')
  async execute(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('flowId') flowId: string,
  ) {
    const datasetId = await this.dataFlowService.execute(requireTenantId(req), appId, flowId);
    return { ok: true as const, data: { datasetId } };
  }
}
