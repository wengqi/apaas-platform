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
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { RecordService } from './record.service.js';
import type { RecordQueryParams } from './record.service.js';

/**
 * 记录控制器 — 记录 CRUD（基于 JSONB 宽表）。
 *
 * 路由：
 *   GET    /api/v1/objects/:objectId/records — 查询记录（分页 + 筛选 + 排序）
 *   GET    /api/v1/records/:recordId         — 按 ID 查
 *   POST   /api/v1/objects/:objectId/records — 创建记录
 *   PUT    /api/v1/records/:recordId         — 更新记录
 *   DELETE /api/v1/records/:recordId         — 删除记录
 *
 * 所有路由受 JWT 保护，从 req.user 取 { sub, tenantId }。
 */
@ApiTags('Record')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Get('objects/:objectId/records')
  @RequirePermission('RECORD', 'VIEW', 'objectId')
  async query(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: string,
  ) {
    const params: RecordQueryParams = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sort,
      filter,
    };
    const result = await this.recordService.query(
      requireTenantId(req),
      objectId,
      params,
      req.permissionContext,
    );
    return { ok: true as const, data: result };
  }

  @Get('records/:recordId')
  @RequirePermission('RECORD', 'VIEW')
  async get(@Req() req: AuthenticatedRequest, @Param('recordId') recordId: string) {
    const record = await this.recordService.get(
      requireTenantId(req),
      recordId,
      req.permissionContext,
    );
    return { ok: true as const, data: record };
  }

  @Post('objects/:objectId/records')
  @RequirePermission('RECORD', 'CREATE', 'objectId')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const record = await this.recordService.create(
      requireTenantId(req),
      objectId,
      req.user.id,
      body ?? {},
    );
    return { ok: true as const, data: record };
  }

  @Put('records/:recordId')
  @RequirePermission('RECORD', 'EDIT')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('recordId') recordId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const record = await this.recordService.update(
      requireTenantId(req),
      recordId,
      req.user.id,
      body ?? {},
    );
    return { ok: true as const, data: record };
  }

  @Delete('records/:recordId')
  @RequirePermission('RECORD', 'DELETE')
  async delete(@Req() req: AuthenticatedRequest, @Param('recordId') recordId: string) {
    await this.recordService.delete(requireTenantId(req), recordId);
    return { ok: true as const, data: { deleted: true } };
  }
}
