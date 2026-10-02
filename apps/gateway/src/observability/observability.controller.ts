/**
 * 观测事件 Controller（P1 运维治理）。
 *
 * - GET /api/v1/observability/events — 分页查询（仅租户管理员）
 * - GET /api/v1/observability/summary — 分类汇总（仅租户管理员）
 * - POST /api/v1/observability/page-errors — 页面报错上报（任意登录用户，
 *   GlobalErrorBoundary 兜底路径；字段截断脱敏在 DTO 层完成）
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EVENT_CATEGORIES, EVENT_LEVELS, type EventCategory, type EventLevel } from '@apaas/shared';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { ObservabilityService } from './observability.service.js';
import { ReportPageErrorDto } from './observability.dto.js';

const DEFAULT_PAGE_SIZE = 20;

@ApiTags('observability')
@ApiBearerAuth()
@Controller({ path: 'observability', version: '1' })
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('events')
  @UseGuards(TenantAdminGuard)
  @ApiOperation({ summary: '分页查询观测事件（租户管理员）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '最大 100' })
  @ApiQuery({ name: 'category', required: false, enum: EVENT_CATEGORIES })
  @ApiQuery({ name: 'level', required: false, enum: EVENT_LEVELS })
  @ApiQuery({ name: 'appId', required: false, type: String })
  @ApiQuery({ name: 'since', required: false, type: String, description: 'ISO 时间下界' })
  @ApiQuery({ name: 'until', required: false, type: String, description: 'ISO 时间上界' })
  async query(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('level') level?: string,
    @Query('appId') appId?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const tenantId = this.requireTenantId(req);
    const validCategory = pickEnum<EventCategory>(category, EVENT_CATEGORIES);
    const validLevel = pickEnum<EventLevel>(level, EVENT_LEVELS);
    const result = await this.observabilityService.query({
      tenantId,
      page: page ? Math.max(1, parseInt(page, 10) || 1) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE,
      category: validCategory,
      level: validLevel,
      appId: appId || undefined,
      since: parseDate(since),
      until: parseDate(until),
    });
    return { ok: true as const, data: result };
  }

  @Get('summary')
  @UseGuards(TenantAdminGuard)
  @ApiOperation({ summary: '分类汇总（最近 24h 总数/错误数，租户管理员）' })
  @ApiQuery({ name: 'appId', required: false, type: String })
  async summary(@Req() req: AuthenticatedRequest, @Query('appId') appId?: string) {
    const tenantId = this.requireTenantId(req);
    const data = await this.observabilityService.summary(tenantId, appId || undefined);
    return { ok: true as const, data };
  }

  @Post('page-errors')
  @HttpCode(202)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '页面报错上报（runtime-ui GlobalErrorBoundary）' })
  async reportPageError(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReportPageErrorDto,
  ): Promise<{ ok: true; data: { received: true } }> {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      // 平台管理员会话的前端报错无租户归属——直接确认接收不入库
      return { ok: true as const, data: { received: true } };
    }
    await this.observabilityService.record({
      tenantId,
      category: 'PAGE_ERROR',
      level: 'ERROR',
      source: 'runtime-ui:error-boundary',
      appId: dto.appId ?? null,
      message: dto.message,
      detail: {
        stack: dto.stack ?? null,
        componentStack: dto.componentStack ?? null,
        href: dto.href ?? null,
      },
    });
    return { ok: true as const, data: { received: true } };
  }

  private requireTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('平台超管无租户上下文，无法查询观测事件');
    }
    return tenantId;
  }
}

/** 枚举查询参数白名单校验：非法值忽略（与审计 category 口径一致）。 */
function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** ISO 日期参数解析：非法值忽略。 */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
