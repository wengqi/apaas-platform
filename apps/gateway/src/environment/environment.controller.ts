/**
 * 环境管理控制器（R1.4）——环境列表/发布/回滚/预检/Deployment 历史/环境变量。
 *
 * 批/驳权限口径：部署与回滚沿用应用发布权限（PAGE/MANAGE @ appId）。
 * 触发器重建在 deploy/rollback 事务成功后由控制器编排（BullMQ 不可事务回滚）。
 */

import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AppEnvironmentDto,
  DeployPreflightDto,
  DeploymentDto,
  EnvironmentKey,
  EnvVarDefDto,
  EnvVarValueDto,
} from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { TriggerService } from '../process/trigger.service.js';
import { EnvironmentService } from './environment.service.js';
import {
  CreateEnvVarDefDto,
  DeployToEnvironmentDto,
  EnvironmentQueryDto,
  RollbackEnvironmentDto,
  SetEnvVarValueDto,
} from './environment.dto.js';

@ApiTags('environments')
@ApiBearerAuth()
@Controller('design/apps')
@UseGuards(PermissionGuard)
export class EnvironmentController {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly triggerService: TriggerService,
  ) {}

  @Get(':appId/environments')
  @ApiOperation({ summary: '环境列表（dev/prod 指针状态）' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ): Promise<{ ok: true; data: AppEnvironmentDto[] }> {
    const data = await this.environmentService.listEnvironments(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  @Get(':appId/environments/:envKey/deployments')
  @ApiOperation({ summary: '环境发布历史' })
  async deployments(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('envKey') envKey: string,
  ): Promise<{ ok: true; data: DeploymentDto[] }> {
    const data = await this.environmentService.listDeployments(
      requireTenantId(req),
      appId,
      envKey as EnvironmentKey,
    );
    return { ok: true as const, data };
  }

  @Post(':appId/environments/:envKey/preflight')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '发布预检（G4 必填环境变量 + 破坏性变更/G1 引用清单）' })
  async preflight(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('envKey') envKey: string,
    @Body() body: DeployToEnvironmentDto,
  ): Promise<{ ok: true; data: DeployPreflightDto }> {
    const tenantId = requireTenantId(req);
    const versionId = body.versionId ?? (await this.latestVersionId(tenantId, appId));
    const data = await this.environmentService.preflight(
      tenantId,
      appId,
      envKey as EnvironmentKey,
      versionId,
    );
    return { ok: true as const, data };
  }

  @Post(':appId/environments/:envKey/publish')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '部署指定版本到指定环境（切指针 + Deployment + 触发器重建）' })
  async deploy(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('envKey') envKey: string,
    @Body() dto: DeployToEnvironmentDto,
  ): Promise<{ ok: true; data: { environment: AppEnvironmentDto; deployment: DeploymentDto } }> {
    const tenantId = requireTenantId(req);
    const result = await this.environmentService.deploy(
      tenantId,
      appId,
      envKey as EnvironmentKey,
      req.user.id,
      dto,
    );
    await this.triggerService.rebuildForEnvironment(tenantId, appId, envKey as EnvironmentKey);
    return { ok: true as const, data: result };
  }

  @Post(':appId/environments/:envKey/rollback')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '回滚环境到指定版本（记录数据不回滚）' })
  async rollback(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('envKey') envKey: string,
    @Body() dto: RollbackEnvironmentDto,
  ): Promise<{ ok: true; data: { environment: AppEnvironmentDto; deployment: DeploymentDto } }> {
    const tenantId = requireTenantId(req);
    const result = await this.environmentService.rollback(
      tenantId,
      appId,
      envKey as EnvironmentKey,
      dto.versionId,
      req.user.id,
      dto.note,
    );
    await this.triggerService.rebuildForEnvironment(tenantId, appId, envKey as EnvironmentKey);
    return { ok: true as const, data: result };
  }

  // ---------------------------------------------------------------------------
  // 环境变量
  // ---------------------------------------------------------------------------

  @Get(':appId/env-vars')
  @ApiOperation({ summary: '环境变量定义 + 指定环境的值（敏感值打码）' })
  async envVars(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Query() query: EnvironmentQueryDto,
  ): Promise<{ ok: true; data: { defs: EnvVarDefDto[]; values: EnvVarValueDto[] } }> {
    const data = await this.environmentService.listEnvVars(
      requireTenantId(req),
      appId,
      (query.env ?? 'prod') as EnvironmentKey,
    );
    return { ok: true as const, data };
  }

  @Post(':appId/env-vars/defs')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '新建环境变量定义（构建态一套）' })
  async createDef(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() dto: CreateEnvVarDefDto,
  ): Promise<{ ok: true; data: EnvVarDefDto }> {
    const data = await this.environmentService.createEnvVarDef(
      requireTenantId(req),
      appId,
      dto,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Post(':appId/env-vars/defs/:defId/delete')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '删除环境变量定义（级联删除各环境值）' })
  async deleteDef(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('defId') defId: string,
  ): Promise<{ ok: true }> {
    await this.environmentService.deleteEnvVarDef(requireTenantId(req), appId, defId, req.user.id);
    return { ok: true as const };
  }

  @Post(':appId/env-vars/defs/:defId/value')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '设置指定环境的变量值（G3 审计；敏感值加密）' })
  async setValue(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('defId') defId: string,
    @Query() query: EnvironmentQueryDto,
    @Body() dto: SetEnvVarValueDto,
  ): Promise<{ ok: true; data: EnvVarValueDto }> {
    const data = await this.environmentService.setEnvVarValue(
      requireTenantId(req),
      appId,
      (query.env ?? 'prod') as EnvironmentKey,
      defId,
      dto.value,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  /** 最新已发布版本（preflight 未显式指定 versionId 时） */
  private async latestVersionId(tenantId: string, appId: string): Promise<string> {
    const version = await this.environmentService.latestPublishedVersion(tenantId, appId);
    if (!version) throw new Error('无可预检的版本');
    return version.id;
  }
}
