/**
 * 审计日志查询 Controller — 提供分页查询和筛选能力。
 *
 * 仅租户管理员可访问（TenantAdminGuard）。
 */

import { Controller, Get, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
import { AuditLogService } from './audit-log.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

const DEFAULT_PAGE_SIZE = 20;

@ApiTags('audit-log')
@ApiBearerAuth()
@Controller({ path: 'audit-logs', version: '1' })
@UseGuards(TenantAdminGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: '分页查询审计日志' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码（默认 1）' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: '每页条数（默认 20，最大 100）',
  })
  @ApiQuery({ name: 'action', required: false, type: String, description: '按操作类型筛选' })
  @ApiQuery({ name: 'resource', required: false, type: String, description: '按资源类型筛选' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: '按用户 ID 筛选' })
  async query(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('userId') userId?: string,
  ) {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('平台超管无租户上下文，无法查询审计日志');
    }
    const result = await this.auditLogService.query({
      tenantId,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : DEFAULT_PAGE_SIZE,
      action: action || undefined,
      resource: resource || undefined,
      userId: userId || undefined,
    });
    return { ok: true as const, data: result };
  }
}
