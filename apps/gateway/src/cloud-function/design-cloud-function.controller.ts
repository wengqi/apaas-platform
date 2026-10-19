/**
 * 云函数 Controller（设计面）— CRUD + 发布（ADR-0005 /design 命名空间，嵌套在应用下）。
 *
 * 权限：沿用 CONNECTOR 权限维度（连接器/函数），
 * 编写/发布云函数需要 BUILDER 级权限，END_USER 默认无权限。
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CloudFunctionService } from './cloud-function.service.js';
import { CreateCloudFunctionDto, UpdateCloudFunctionDto } from './dto/cloud-function.dto.js';

@ApiTags('cloud-functions (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/cloud-functions')
@UseGuards(PermissionGuard)
export class DesignCloudFunctionController {
  constructor(private readonly cloudFunctionService: CloudFunctionService) {}

  @Get()
  @RequirePermission('CONNECTOR', 'VIEW')
  @ApiOperation({ summary: '列出应用下所有云函数' })
  async list(@Param('appId') appId: string, @Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.list(tenantId, appId);
    return { ok: true as const, data };
  }

  @Post()
  @RequirePermission('CONNECTOR', 'CREATE')
  @ApiOperation({ summary: '创建云函数' })
  async create(
    @Param('appId') appId: string,
    @Body() body: CreateCloudFunctionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.create(tenantId, appId, req.user.id, body);
    return { ok: true as const, data };
  }

  @Get(':id')
  @RequirePermission('CONNECTOR', 'VIEW', 'id')
  @ApiOperation({ summary: '获取云函数详情' })
  async get(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.get(tenantId, appId, id);
    return { ok: true as const, data };
  }

  @Put(':id')
  @RequirePermission('CONNECTOR', 'EDIT', 'id')
  @ApiOperation({ summary: '更新云函数' })
  async update(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Body() body: UpdateCloudFunctionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.update(tenantId, appId, id, req.user.id, body);
    return { ok: true as const, data };
  }

  @Delete(':id')
  @RequirePermission('CONNECTOR', 'DELETE', 'id')
  @ApiOperation({ summary: '删除云函数' })
  async delete(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    await this.cloudFunctionService.delete(tenantId, appId, id, req.user.id);
    return { ok: true as const, data: null };
  }

  @Post(':id/publish')
  @RequirePermission('CONNECTOR', 'EDIT', 'id')
  @ApiOperation({ summary: '发布云函数' })
  async publish(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.publish(tenantId, appId, id, req.user.id);
    return { ok: true as const, data };
  }
}
