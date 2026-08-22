/**
 * 云函数 Controller — CRUD + 发布 + 执行 API 端点。
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
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CloudFunctionService } from './cloud-function.service.js';
import type {
  CreateCloudFunctionRequest,
  UpdateCloudFunctionRequest,
  InvokeCloudFunctionRequest,
} from '@apaas/shared';

@ApiTags('cloud-functions')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class CloudFunctionController {
  constructor(private readonly cloudFunctionService: CloudFunctionService) {}

  @Get('apps/:appId/cloud-functions')
  @ApiOperation({ summary: '列出应用下所有云函数' })
  async list(@Param('appId') appId: string, @Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.list(tenantId, appId);
    return { ok: true as const, data };
  }

  @Post('apps/:appId/cloud-functions')
  @ApiOperation({ summary: '创建云函数' })
  async create(
    @Param('appId') appId: string,
    @Body() body: CreateCloudFunctionRequest,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.create(tenantId, appId, req.user.id, body);
    return { ok: true as const, data };
  }

  @Get('cloud-functions/:id')
  @ApiOperation({ summary: '获取云函数详情' })
  async get(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.get(tenantId, id);
    return { ok: true as const, data };
  }

  @Put('cloud-functions/:id')
  @ApiOperation({ summary: '更新云函数' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCloudFunctionRequest,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.update(tenantId, id, req.user.id, body);
    return { ok: true as const, data };
  }

  @Delete('cloud-functions/:id')
  @ApiOperation({ summary: '删除云函数' })
  async delete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId!;
    await this.cloudFunctionService.delete(tenantId, id, req.user.id);
    return { ok: true as const, data: null };
  }

  @Post('cloud-functions/:id/publish')
  @ApiOperation({ summary: '发布云函数' })
  async publish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.publish(tenantId, id, req.user.id);
    return { ok: true as const, data };
  }

  @Post('cloud-functions/:id/invoke')
  @ApiOperation({ summary: '执行云函数' })
  async invoke(
    @Param('id') id: string,
    @Body() body: InvokeCloudFunctionRequest,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.invoke(tenantId, id, body);
    return { ok: true as const, data };
  }
}
