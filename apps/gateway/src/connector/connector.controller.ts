/**
 * 连接器控制器 — 连接器 CRUD + 测试 + 调用。
 *
 * 路由：
 *   GET    /api/apps/:appId/connectors           — 连接器列表
 *   GET    /api/connectors/:connectorId           — 连接器详情
 *   POST   /api/apps/:appId/connectors            — 创建连接器
 *   PUT    /api/connectors/:connectorId           — 更新连接器
 *   DELETE /api/connectors/:connectorId           — 删除连接器
 *   POST   /api/connectors/:connectorId/test      — 测试连接器
 *   POST   /api/connectors/:connectorId/invoke    — 调用连接器
 */

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ConnectorService } from './connector.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import type {
  InvokeConnectorRequest,
  CreateConnectorRequest,
  UpdateConnectorRequest,
} from '@apaas/shared';

@ApiTags('Connector')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  @Get('apps/:appId/connectors')
  @RequirePermission('CONNECTOR', 'VIEW')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const connectors = await this.connectorService.list(requireTenantId(req), appId);
    return { ok: true as const, data: connectors };
  }

  @Get('connectors/:connectorId')
  @RequirePermission('CONNECTOR', 'VIEW', 'connectorId')
  async get(@Req() req: AuthenticatedRequest, @Param('connectorId') connectorId: string) {
    const connector = await this.connectorService.get(requireTenantId(req), connectorId);
    return { ok: true as const, data: connector };
  }

  @Post('apps/:appId/connectors')
  @RequirePermission('CONNECTOR', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateConnectorRequest,
  ) {
    const connector = await this.connectorService.create(
      requireTenantId(req),
      appId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: connector };
  }

  @Put('connectors/:connectorId')
  @RequirePermission('CONNECTOR', 'EDIT', 'connectorId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('connectorId') connectorId: string,
    @Body() body: UpdateConnectorRequest,
  ) {
    const connector = await this.connectorService.update(
      requireTenantId(req),
      connectorId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: connector };
  }

  @Delete('connectors/:connectorId')
  @RequirePermission('CONNECTOR', 'DELETE', 'connectorId')
  async delete(@Req() req: AuthenticatedRequest, @Param('connectorId') connectorId: string) {
    await this.connectorService.delete(requireTenantId(req), connectorId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post('connectors/:connectorId/test')
  @RequirePermission('CONNECTOR', 'EXECUTE', 'connectorId')
  async test(
    @Req() req: AuthenticatedRequest,
    @Param('connectorId') connectorId: string,
    @Body() body: InvokeConnectorRequest,
  ) {
    const result = await this.connectorService.test(requireTenantId(req), connectorId, body);
    return { ok: true as const, data: result };
  }

  @Post('connectors/:connectorId/invoke')
  @RequirePermission('CONNECTOR', 'EXECUTE', 'connectorId')
  async invoke(
    @Req() req: AuthenticatedRequest,
    @Param('connectorId') connectorId: string,
    @Body() body: InvokeConnectorRequest,
  ) {
    const result = await this.connectorService.invoke(requireTenantId(req), connectorId, body);
    return { ok: true as const, data: result };
  }
}
