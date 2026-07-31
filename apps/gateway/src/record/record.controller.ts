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
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { RecordService } from './record.service.js';
import type { RecordQueryParams } from './record.service.js';

/**
 * 记录控制器 — 记录 CRUD（基于 JSONB 宽表）。
 *
 * 路由：
 *   GET    /api/objects/:objectId/records — 查询记录（分页 + 筛选 + 排序）
 *   GET    /api/records/:recordId         — 按 ID 查
 *   POST   /api/objects/:objectId/records — 创建记录
 *   PUT    /api/records/:recordId         — 更新记录
 *   DELETE /api/records/:recordId         — 删除记录
 *
 * 所有路由受 JWT 保护，从 req.user 取 { sub, tenantId }。
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Get('objects/:objectId/records')
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
      req.user.tenantId,
      objectId,
      params,
    );
    return { ok: true as const, data: result };
  }

  @Get('records/:recordId')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('recordId') recordId: string,
  ) {
    const record = await this.recordService.get(req.user.tenantId, recordId);
    return { ok: true as const, data: record };
  }

  @Post('objects/:objectId/records')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const record = await this.recordService.create(
      req.user.tenantId,
      objectId,
      req.user.id,
      body ?? {},
    );
    return { ok: true as const, data: record };
  }

  @Put('records/:recordId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('recordId') recordId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const record = await this.recordService.update(
      req.user.tenantId,
      recordId,
      req.user.id,
      body ?? {},
    );
    return { ok: true as const, data: record };
  }

  @Delete('records/:recordId')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('recordId') recordId: string,
  ) {
    await this.recordService.delete(req.user.tenantId, recordId);
    return { ok: true as const, data: { deleted: true } };
  }
}

