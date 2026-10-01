/**
 * 服务身份管理控制器（G6，JWT 管理面）——创建（明文一次性）/列表/吊销。
 * 权限口径沿用应用管理资源（PAGE/MANAGE @ appId）。
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ServiceIdentityCreatedDto, ServiceIdentityDto } from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ApiKeyService } from './api-key.service.js';
import { CreateServiceIdentityDto } from './service-identity.dto.js';

@ApiTags('service-identities')
@ApiBearerAuth()
@Controller('apps')
@UseGuards(PermissionGuard)
export class ServiceIdentityController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post(':appId/service-identities')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '创建服务身份（明文 key 仅此一次返回）' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() dto: CreateServiceIdentityDto,
  ): Promise<{ ok: true; data: ServiceIdentityCreatedDto }> {
    const data = await this.apiKeyService.create(requireTenantId(req), req.user.id, {
      name: dto.name,
      appId,
    });
    return { ok: true as const, data };
  }

  @Get(':appId/service-identities')
  @ApiOperation({ summary: '服务身份列表（仅元数据，无明文/哈希）' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ): Promise<{ ok: true; data: ServiceIdentityDto[] }> {
    const data = await this.apiKeyService.list(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Post(':appId/service-identities/:identityId/revoke')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '吊销服务身份（立即失效）' })
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('identityId') identityId: string,
  ): Promise<{ ok: true; data: ServiceIdentityDto }> {
    const data = await this.apiKeyService.revoke(requireTenantId(req), req.user.id, identityId);
    return { ok: true as const, data };
  }
}
