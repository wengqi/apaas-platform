/**
 * 图表数据 Controller — 提供后端聚合 API 端点。
 *
 * POST /api/v1/apps/:appId/datasets/chart-data
 * 接收图表配置（数据源 + 分类字段 + 值字段 + 聚合方式），
 * 返回聚合后的结构化数据（categories + values），前端直接构建 ECharts option。
 *
 * 安全（P0 修复）：此前仅 JwtAuthGuard 且 appId 被忽略、无行级条件注入，
 * 调用方可通过任意 JsonLogic filter 逐条读取租户内任意记录（ABAC 旁路）。
 * 现接入 PermissionGuard + RECORD:VIEW 权限，服务层执行数据源归属校验
 * + ABAC 行条件注入 + fieldScope 列校验。
 */

import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { ChartDataService } from './chart-data.service.js';
import { ChartDataDto } from './dto/chart-data.dto.js';

@ApiTags('chart-data')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class ChartDataController {
  constructor(private readonly chartDataService: ChartDataService) {}

  @Post('apps/:appId/datasets/chart-data')
  @RequirePermission('RECORD', 'VIEW')
  @ApiOperation({ summary: '图表数据聚合' })
  async getChartData(
    @Param('appId') appId: string,
    @Body() body: ChartDataDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // sourceId 在 body 中无法走装饰器的 targetIdParam 机制，
    // 对象/数据集归属与行级条件在服务层强制执行
    const result = await this.chartDataService.aggregate(
      requireTenantId(req),
      appId,
      body,
      req.permissionContext,
    );
    return { ok: true as const, data: result };
  }
}
