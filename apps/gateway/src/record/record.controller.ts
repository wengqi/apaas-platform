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
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { RecordService } from './record.service.js';
import { RecordImportExportService } from './record-import-export.service.js';
import type { RecordQueryParams } from './record.service.js';
import { RecordCreateDto, RecordUpdateDto } from './dto/record.dto.js';
import { BatchCreateDto, BatchUpdateDto, BatchDeleteDto } from './dto/batch-record.dto.js';

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
  constructor(
    private readonly recordService: RecordService,
    private readonly importExportService: RecordImportExportService,
  ) {}

  @Get('objects/:objectId/records')
  @RequirePermission('RECORD', 'VIEW', 'objectId')
  async query(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: string,
    @Query('keyword') keyword?: string,
  ) {
    const params: RecordQueryParams = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      sort,
      filter,
      keyword,
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
  @ApiBody({
    description: '记录字段键值对（动态 JSONB 结构，key 为字段 apiName）',
    type: RecordCreateDto,
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    // 动态字段结构：参数类型为 Record（Object metatype），全局 ValidationPipe 跳过校验，
    // 避免 whitelist 拒绝动态字段（记录字段值由 RecordService 依据 ObjectMeta 处理）
    @Body() body: Record<string, unknown>,
  ) {
    const record = await this.recordService.create(
      requireTenantId(req),
      objectId,
      req.user.id,
      body ?? {},
      req.permissionContext,
    );
    return { ok: true as const, data: record };
  }

  @Put('records/:recordId')
  @RequirePermission('RECORD', 'EDIT')
  @ApiBody({
    description: '更新的字段键值对（动态 JSONB 结构，key 为字段 apiName）',
    type: RecordUpdateDto,
  })
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
      req.permissionContext,
    );
    return { ok: true as const, data: record };
  }

  @Delete('records/:recordId')
  @RequirePermission('RECORD', 'DELETE')
  async delete(@Req() req: AuthenticatedRequest, @Param('recordId') recordId: string) {
    await this.recordService.delete(
      requireTenantId(req),
      recordId,
      req.permissionContext,
      req.user.id,
    );
    return { ok: true as const, data: { deleted: true } };
  }

  // -------------------------------------------------------------------------
  // 批量操作
  // -------------------------------------------------------------------------

  @Post('objects/:objectId/records/batch-create')
  @RequirePermission('RECORD', 'CREATE', 'objectId')
  @ApiOperation({ summary: '批量创建记录' })
  async batchCreate(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: BatchCreateDto,
  ) {
    const result = await this.recordService.batchCreate(
      requireTenantId(req),
      objectId,
      req.user.id,
      body.records,
      req.permissionContext,
    );
    return { ok: true as const, data: result };
  }

  @Put('records/batch-update')
  @RequirePermission('RECORD', 'EDIT')
  @ApiOperation({ summary: '批量更新记录' })
  async batchUpdate(@Req() req: AuthenticatedRequest, @Body() body: BatchUpdateDto) {
    const result = await this.recordService.batchUpdate(
      requireTenantId(req),
      body.recordIds,
      req.user.id,
      body.data,
      req.permissionContext,
    );
    return { ok: true as const, data: result };
  }

  @Post('records/batch-delete')
  @RequirePermission('RECORD', 'DELETE')
  @ApiOperation({ summary: '批量删除记录' })
  async batchDelete(@Req() req: AuthenticatedRequest, @Body() body: BatchDeleteDto) {
    const result = await this.recordService.batchDelete(
      requireTenantId(req),
      body.recordIds,
      req.permissionContext,
    );
    return { ok: true as const, data: result };
  }

  // -------------------------------------------------------------------------
  // CSV 导入导出
  // -------------------------------------------------------------------------

  @Get('objects/:objectId/records/export')
  @RequirePermission('RECORD', 'VIEW', 'objectId')
  @ApiOperation({ summary: '导出记录为 CSV' })
  async exportCsv(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: string,
    @Res() res?: Response,
  ) {
    const params: RecordQueryParams = { sort, filter };
    const csv = await this.importExportService.exportToCsv(
      requireTenantId(req),
      objectId,
      params,
      req.permissionContext,
    );

    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="${objectId}_records.csv"`);
    res!.send(csv);
  }

  @Post('objects/:objectId/records/import')
  @RequirePermission('RECORD', 'CREATE', 'objectId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: '从 CSV 导入记录' })
  async importCsv(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请上传 CSV 文件');
    const csvContent = file.buffer.toString('utf-8');
    const result = await this.importExportService.importFromCsv(
      requireTenantId(req),
      objectId,
      req.user.id,
      csvContent,
      req.permissionContext,
    );
    return { ok: true as const, data: result };
  }

  @Get('objects/:objectId/records/import-template')
  @RequirePermission('RECORD', 'VIEW', 'objectId')
  @ApiOperation({ summary: '下载导入模板 CSV' })
  async getImportTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Res() res?: Response,
  ) {
    const csv = await this.importExportService.getImportTemplate(requireTenantId(req), objectId);

    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="${objectId}_template.csv"`);
    res!.send(csv);
  }
}
