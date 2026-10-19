/**
 * 数据集控制器（设计面）— 应用下数据集列表 / 删除 / 手动刷新（ADR-0005 /design 命名空间）。
 * 元信息与行查询是运行面读（DatasetController，/datasets/:id[/rows]），studio 与看板共用。
 */

import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { DatasetService } from './dataset.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('Dataset (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/datasets')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class DesignDatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Get()
  @RequirePermission('DATA_MODEL', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const datasets = await this.datasetService.list(requireTenantId(req), appId);
    return { ok: true as const, data: datasets };
  }

  @Delete(':datasetId')
  @RequirePermission('DATA_MODEL', 'DELETE')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('datasetId') datasetId: string,
  ) {
    await this.datasetService.delete(requireTenantId(req), appId, datasetId);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post(':datasetId/refresh')
  @RequirePermission('DATA_MODEL', 'EXECUTE')
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('datasetId') datasetId: string,
  ) {
    const result = await this.datasetService.refresh(requireTenantId(req), appId, datasetId);
    return { ok: true as const, data: { datasetId: result } };
  }
}
