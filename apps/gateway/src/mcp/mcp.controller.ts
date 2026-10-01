/**
 * MCP 控制器 — Streamable HTTP 端点（G4/R1.6）。
 *
 * 路由：POST /api/v1/mcp（无状态 JSON 模式，enableJsonResponse）
 * 认证：PermissionGuard（继承 JwtAuthGuard）——AI 客户端以平台用户身份的
 *       JWT 调用（/auth/login 获取）；租户上下文由全局拦截器写入 ALS，
 *       工具内的 prisma 读写自动租户隔离。
 * 治理：写工具一律草稿（见 mcp.service），人审发布走搭建器既有流程（G1）。
 */

import { Controller, All, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { PermissionGuard } from '../permission/permission.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { McpService } from './mcp.service.js';
import { createMcpServer } from './mcp-server.factory.js';

@ApiTags('MCP')
@ApiBearerAuth()
@Controller('mcp')
@UseGuards(PermissionGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  /**
   * MCP Streamable HTTP 入口。
   * 每请求一个无状态 transport + server（MCP 无状态模式，JSON 响应）；
   * express 已解析的 JSON body 直接交给 transport（handleRequest 第三参）。
   */
  @All()
  async handle(
    @Req() req: Request & { user?: { id: string } },
    @Res() res: Response,
  ): Promise<void> {
    const authenticated = req as unknown as AuthenticatedRequest;
    const tenantId = requireTenantId(authenticated);
    const userId = authenticated.user?.id ?? 'unknown';

    const server = createMcpServer(this.mcpService, tenantId, userId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
