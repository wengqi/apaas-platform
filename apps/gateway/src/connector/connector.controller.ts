/**
 * 连接器控制器（运行面）— 调用连接器（页面 / 流程节点执行时的出站请求代理）。
 * CRUD 与连通性测试在 DesignConnectorController（/design/apps/:appId/connectors，ADR-0005）。
 *
 *   POST /api/v1/connectors/:connectorId/invoke — 调用连接器
 */

import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ConnectorService } from './connector.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { InvokeConnectorDto } from './dto/connector.dto.js';

@ApiTags('Connector (runtime)')
@ApiBearerAuth()
@Controller('connectors')
@UseGuards(PermissionGuard)
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  @Post(':connectorId/invoke')
  @RequirePermission('CONNECTOR', 'EXECUTE', 'connectorId')
  async invoke(
    @Req() req: AuthenticatedRequest,
    @Param('connectorId') connectorId: string,
    @Body() body: InvokeConnectorDto,
  ) {
    const result = await this.connectorService.invoke(requireTenantId(req), connectorId, body);
    return { ok: true as const, data: result };
  }
}
