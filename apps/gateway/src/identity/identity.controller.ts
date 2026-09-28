/**
 * 企业身份对接控制器。
 *
 * - CAS 登录/回调：免鉴权（登录入口本身），tenant 由 query 传入
 * - 配置 CRUD / 手动同步 / 同步日志：租户管理员（TenantAdminGuard 含 JWT 校验），
 *   tenantId 取自认证上下文（requireTenantId），不接受请求体传入（防越权）
 */

import { Body, Controller, Get, Post, Query, Redirect, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
import { SsoService } from './sso.service.js';
import { IdentityConfigService } from './identity-config.service.js';
import { DirectorySyncService } from './directory-sync.service.js';

@ApiTags('Identity')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly ssoService: SsoService,
    private readonly configService: IdentityConfigService,
    private readonly syncService: DirectorySyncService,
  ) {}

  /** CAS 登录入口：返回跳转 URL（302 由前端或网关完成；免鉴权） */
  @Get('cas/login')
  @Redirect()
  async casLogin(@Query('tenant') tenantSlug: string) {
    const url = await this.ssoService.buildCasLoginUrl(tenantSlug);
    return { url };
  }

  /** CAS 回调：ticket 校验 + 绑定/建号 + 签发平台 JWT（M1 返回 JSON；前端接手后改为 302 携 token） */
  @Get('cas/callback')
  async casCallback(@Query('tenant') tenantSlug: string, @Query() query: Record<string, string>) {
    return this.ssoService.casCallback(tenantSlug, query);
  }

  /** 对接配置 upsert（按租户 + kind + type 唯一）— 租户管理员 */
  @Post('configs')
  @ApiBearerAuth()
  @UseGuards(TenantAdminGuard)
  async upsertConfig(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      kind: 'auth-provider' | 'directory-source';
      type: string;
      config: Record<string, unknown>;
      isActive?: boolean;
    },
  ) {
    const row = await this.configService.upsertConfig(
      requireTenantId(req),
      body.kind,
      body.type,
      body.config ?? {},
      body.isActive ?? false,
    );
    return { ok: true as const, data: { id: row.id } };
  }

  /** 对接配置列表（敏感字段脱敏）— 租户管理员 */
  @Get('configs')
  @ApiBearerAuth()
  @UseGuards(TenantAdminGuard)
  async listConfigs(@Req() req: AuthenticatedRequest) {
    const rows = await this.configService.listConfigs(requireTenantId(req));
    return { ok: true as const, data: rows };
  }

  /** 手动触发目录同步（ldap | hr-api，默认 ldap）— 租户管理员 */
  @Post('sync')
  @ApiBearerAuth()
  @UseGuards(TenantAdminGuard)
  async sync(@Req() req: AuthenticatedRequest, @Body() body: { source?: 'ldap' | 'hr-api' }) {
    const stats = await this.syncService.syncTenant(requireTenantId(req), body.source ?? 'ldap');
    return { ok: true as const, data: stats };
  }

  /** 同步日志（最近 50 条）— 租户管理员 */
  @Get('sync-logs')
  @ApiBearerAuth()
  @UseGuards(TenantAdminGuard)
  async syncLogs(@Req() req: AuthenticatedRequest) {
    const logs = await this.syncService.listLogs(requireTenantId(req), 50);
    return { ok: true as const, data: logs };
  }
}
