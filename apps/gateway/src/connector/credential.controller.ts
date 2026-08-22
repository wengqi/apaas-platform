/**
 * 凭证控制器 — 连接器凭证管理 API。
 *
 * 路由：
 *   GET    /api/apps/:appId/credentials          — 凭证列表
 *   POST   /api/apps/:appId/credentials          — 创建凭证
 *   PUT    /api/credentials/:credentialId         — 更新凭证
 *   DELETE /api/credentials/:credentialId         — 删除凭证
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import {
  CredentialService,
  type CreateCredentialInput,
  type UpdateCredentialInput,
} from './credential.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('Connector Credential')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get('apps/:appId/credentials')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const credentials = await this.credentialService.list(requireTenantId(req), appId);
    return { ok: true as const, data: credentials };
  }

  @Post('apps/:appId/credentials')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateCredentialInput,
  ) {
    const credential = await this.credentialService.create(requireTenantId(req), appId, body);
    return { ok: true as const, data: credential };
  }

  @Put('credentials/:credentialId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('credentialId') credentialId: string,
    @Body() body: UpdateCredentialInput,
  ) {
    const credential = await this.credentialService.update(
      requireTenantId(req),
      credentialId,
      body,
    );
    return { ok: true as const, data: credential };
  }

  @Delete('credentials/:credentialId')
  async delete(@Req() req: AuthenticatedRequest, @Param('credentialId') credentialId: string) {
    await this.credentialService.delete(requireTenantId(req), credentialId);
    return { ok: true as const, data: { deleted: true } };
  }
}
