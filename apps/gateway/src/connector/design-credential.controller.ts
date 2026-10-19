/**
 * 凭证控制器（设计面）— 连接器凭证管理（ADR-0005 /design 命名空间，嵌套在应用下）。
 *
 *   GET    /api/v1/design/apps/:appId/credentials                — 凭证列表
 *   POST   /api/v1/design/apps/:appId/credentials                — 创建凭证
 *   PUT    /api/v1/design/apps/:appId/credentials/:credentialId  — 更新凭证
 *   DELETE /api/v1/design/apps/:appId/credentials/:credentialId  — 删除凭证
 *
 * 权限：凭证属于敏感信息（加密存储的外部系统密钥），
 * 沿用 CONNECTOR 权限维度（连接器/函数），BUILDER 角色管理，END_USER 默认无权限。
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { CredentialService } from './credential.service.js';
import { CreateCredentialDto, UpdateCredentialDto } from './dto/credential.dto.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('Connector Credential (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/credentials')
@UseGuards(PermissionGuard)
export class DesignCredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get()
  @RequirePermission('CONNECTOR', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const credentials = await this.credentialService.list(requireTenantId(req), appId);
    return { ok: true as const, data: credentials };
  }

  @Post()
  @RequirePermission('CONNECTOR', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateCredentialDto,
  ) {
    const credential = await this.credentialService.create(requireTenantId(req), appId, body);
    return { ok: true as const, data: credential };
  }

  @Put(':credentialId')
  @RequirePermission('CONNECTOR', 'EDIT', 'credentialId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('credentialId') credentialId: string,
    @Body() body: UpdateCredentialDto,
  ) {
    const credential = await this.credentialService.update(
      requireTenantId(req),
      appId,
      credentialId,
      body,
    );
    return { ok: true as const, data: credential };
  }

  @Delete(':credentialId')
  @RequirePermission('CONNECTOR', 'DELETE', 'credentialId')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('credentialId') credentialId: string,
  ) {
    await this.credentialService.delete(requireTenantId(req), appId, credentialId);
    return { ok: true as const, data: { deleted: true } };
  }
}
