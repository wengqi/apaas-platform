/**
 * 数据集控制器（运行面）— 数据集元信息 / 行查询（看板取数，ADR-0005 design/runtime 双命名空间）。
 * 设计面（应用下数据集列表 / 删除 / 手动刷新）在 DesignDatasetController。
 */

import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { DatasetService } from './dataset.service.js';
import { DatasetRowService } from './dataset-row.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('Dataset (runtime)')
@ApiBearerAuth()
@Controller('datasets')
@UseGuards(PermissionGuard)
export class DatasetController {
  constructor(
    private readonly datasetService: DatasetService,
    private readonly rowService: DatasetRowService,
  ) {}

  @Get(':datasetId')
  @RequirePermission('DATA_MODEL', 'VIEW')
  async get(@Req() req: AuthenticatedRequest, @Param('datasetId') datasetId: string) {
    const dataset = await this.datasetService.get(requireTenantId(req), datasetId);
    return { ok: true as const, data: dataset };
  }

  @Get(':datasetId/rows')
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
}
