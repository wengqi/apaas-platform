/**
 * 图表数据 Controller — 提供后端聚合 API 端点。
 *
 * POST /api/v1/apps/:appId/datasets/chart-data
 * 接收图表配置（数据源 + 分类字段 + 值字段 + 聚合方式），
 * 返回聚合后的结构化数据（categories + values），前端直接构建 ECharts option。
 */

import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { ChartDataService } from './chart-data.service.js';
import { ChartDataDto } from './dto/chart-data.dto.js';

@ApiTags('chart-data')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class ChartDataController {
  constructor(private readonly chartDataService: ChartDataService) {}

  @Post('apps/:appId/datasets/chart-data')
  @ApiOperation({ summary: '图表数据聚合' })
  async getChartData(
    @Param('appId') _appId: string,
    @Body() body: ChartDataDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const result = await this.chartDataService.aggregate(tenantId, body);
    return { ok: true as const, data: result };
  }
}
