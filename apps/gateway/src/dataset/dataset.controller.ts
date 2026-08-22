/**
 * 数据集控制器 — 数据集列表/详情/删除/查询行/刷新。
 */

import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { DatasetService } from './dataset.service.js';
import { DatasetRowService } from './dataset-row.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('Dataset')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class DatasetController {
  constructor(
    private readonly datasetService: DatasetService,
    private readonly rowService: DatasetRowService,
  ) {}

  @Get('apps/:appId/datasets')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const datasets = await this.datasetService.list(requireTenantId(req), appId);
    return { ok: true as const, data: datasets };
  }

  @Get('datasets/:datasetId')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async get(@Req() req: AuthenticatedRequest, @Param('datasetId') datasetId: string) {
    const dataset = await this.datasetService.get(requireTenantId(req), datasetId);
    return { ok: true as const, data: dataset };
  }

  @Delete('datasets/:datasetId')
  @RequirePermission('DATA_MODEL', 'DELETE')
  async delete(@Req() req: AuthenticatedRequest, @Param('datasetId') datasetId: string) {
    await this.datasetService.delete(requireTenantId(req), datasetId);
    return { ok: true as const, data: { deleted: true } };
  }

  @Get('datasets/:datasetId/rows')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async queryRows(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: string,
  ) {
    const result = await this.rowService.query(requireTenantId(req), datasetId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sort,
      filter,
    });
    return { ok: true as const, data: result };
  }

  @Post('datasets/:datasetId/refresh')
  @RequirePermission('DATA_MODEL', 'EXECUTE')
  async refresh(@Req() req: AuthenticatedRequest, @Param('datasetId') datasetId: string) {
    const result = await this.datasetService.refresh(requireTenantId(req), datasetId);
    return { ok: true as const, data: { datasetId: result } };
  }
}
