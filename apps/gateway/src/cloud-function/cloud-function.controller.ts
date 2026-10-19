/**
 * 云函数 Controller（运行面）— 执行云函数（页面 / 流程节点调用）。
 * CRUD 与发布在 DesignCloudFunctionController（/design/apps/:appId/cloud-functions，ADR-0005）。
 *
 * 权限：沿用 CONNECTOR 权限维度（连接器/函数），END_USER 默认无权限。
 */

import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { CloudFunctionService } from './cloud-function.service.js';
import { InvokeCloudFunctionDto } from './dto/cloud-function.dto.js';

@ApiTags('cloud-functions (runtime)')
@ApiBearerAuth()
@Controller('cloud-functions')
@UseGuards(PermissionGuard)
export class CloudFunctionController {
  constructor(private readonly cloudFunctionService: CloudFunctionService) {}

  @Post(':id/invoke')
  @RequirePermission('CONNECTOR', 'EXECUTE', 'id')
  @ApiOperation({ summary: '执行云函数' })
  async invoke(
    @Param('id') id: string,
    @Body() body: InvokeCloudFunctionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId!;
    const data = await this.cloudFunctionService.invoke(tenantId, id, body);
    return { ok: true as const, data };
  }
}
