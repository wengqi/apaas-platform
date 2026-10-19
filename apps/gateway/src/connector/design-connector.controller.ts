/**
 * 连接器控制器（设计面）— 连接器 CRUD + 连通性测试（ADR-0005 /design 命名空间，嵌套在应用下）。
 *
 *   GET    /api/v1/design/apps/:appId/connectors                    — 连接器列表
 *   POST   /api/v1/design/apps/:appId/connectors                    — 创建连接器
 *   GET    /api/v1/design/apps/:appId/connectors/:connectorId       — 连接器详情
 *   PUT    /api/v1/design/apps/:appId/connectors/:connectorId       — 更新连接器
 *   DELETE /api/v1/design/apps/:appId/connectors/:connectorId       — 删除连接器
 *   POST   /api/v1/design/apps/:appId/connectors/:connectorId/test  — 测试连接器
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ConnectorService } from './connector.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { CreateConnectorDto, UpdateConnectorDto, InvokeConnectorDto } from './dto/connector.dto.js';

@ApiTags('Connector (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/connectors')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class DesignConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  @Get()
  @RequirePermission('CONNECTOR', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const connectors = await this.connectorService.list(requireTenantId(req), appId);
    return { ok: true as const, data: connectors };
  }

  @Post()
  @RequirePermission('CONNECTOR', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateConnectorDto,
  ) {
    const connector = await this.connectorService.create(
      requireTenantId(req),
      appId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: connector };
  }

  @Get(':connectorId')
  @RequirePermission('CONNECTOR', 'VIEW', 'connectorId')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('connectorId') connectorId: string,
  ) {
    const connector = await this.connectorService.get(requireTenantId(req), appId, connectorId);
    return { ok: true as const, data: connector };
  }

  @Put(':connectorId')
  @RequirePermission('CONNECTOR', 'EDIT', 'connectorId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('connectorId') connectorId: string,
    @Body() body: UpdateConnectorDto,
  ) {
    const connector = await this.connectorService.update(
      requireTenantId(req),
      appId,
      connectorId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: connector };
  }

  @Delete(':connectorId')
  @RequirePermission('CONNECTOR', 'DELETE', 'connectorId')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('connectorId') connectorId: string,
  ) {
    await this.connectorService.delete(requireTenantId(req), appId, connectorId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post(':connectorId/test')
  @RequirePermission('CONNECTOR', 'EXECUTE', 'connectorId')
  async test(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('connectorId') connectorId: string,
    @Body() body: InvokeConnectorDto,
  ) {
    const result = await this.connectorService.test(requireTenantId(req), appId, connectorId, body);
    return { ok: true as const, data: result };
  }
}
