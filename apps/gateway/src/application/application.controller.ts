import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ApplicationService } from './application.service.js';
import { CheckService } from './check.service.js';
import { ChangeLogService } from './changelog.service.js';
import type {
  CreateAppRequest,
  UpdateAppRequest,
  PublishAppRequest,
} from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

/**
 * 应用控制器 — Application CRUD + 发布/预检/版本管理。
 * 所有路由受 PermissionGuard 保护（认证 + 授权），从 token 中提取 tenantId。
 * 查询路由仅认证即可；管理类路由需 MANAGE 权限。
 */
@Controller('apps')
@UseGuards(PermissionGuard)
export class ApplicationController {
  constructor(
    private readonly appService: ApplicationService,
    private readonly checkService: CheckService,
    private readonly changeLogService: ChangeLogService,
  ) {}

  // ===========================================================================
  // 应用 CRUD
  // ===========================================================================

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const apps = await this.appService.list(req.user.tenantId);
    return { ok: true as const, data: apps };
  }

  @Get(':appId')
  async get(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const app = await this.appService.get(req.user.tenantId, appId);
    return { ok: true as const, data: app };
  }

  @Post()
  @RequirePermission('PAGE', 'MANAGE')
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateAppRequest) {
    const app = await this.appService.create(req.user.tenantId, req.user.id, body);
    return { ok: true as const, data: app };
  }

  @Put(':appId')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: UpdateAppRequest,
  ) {
    const app = await this.appService.update(req.user.tenantId, appId, body);
    return { ok: true as const, data: app };
  }

  @Delete(':appId')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async delete(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    await this.appService.delete(req.user.tenantId, appId);
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 预检
  // ===========================================================================

  @Post(':appId/check')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async check(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const result = await this.appService.check(
      req.user.tenantId,
      appId,
      req.user.id,
    );
    return { ok: true as const, data: result };
  }

  @Get(':appId/checks')
  async listChecks(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ) {
    const checks = await this.appService.listChecks(req.user.tenantId, appId);
    return { ok: true as const, data: checks };
  }

  // ===========================================================================
  // 变更追踪
  // ===========================================================================

  @Get(':appId/changes')
  async getChanges(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ) {
    const changeSet = await this.changeLogService.getChangeSet(
      req.user.tenantId,
      appId,
    );
    return { ok: true as const, data: changeSet };
  }

  // ===========================================================================
  // 发布与版本管理
  // ===========================================================================

  @Post(':appId/publish')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async publish(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: PublishAppRequest,
  ) {
    const version = await this.appService.publish(
      req.user.tenantId,
      appId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: version };
  }

  @Get(':appId/versions')
  async listVersions(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ) {
    const versions = await this.appService.listVersions(
      req.user.tenantId,
      appId,
    );
    return { ok: true as const, data: versions };
  }

  @Get(':appId/versions/:versionId')
  async getVersion(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('versionId') versionId: string,
  ) {
    const version = await this.appService.getVersion(
      req.user.tenantId,
      appId,
      versionId,
    );
    return { ok: true as const, data: version };
  }

  @Post(':appId/versions/:versionId/rollback')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async rollback(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('versionId') versionId: string,
  ) {
    const version = await this.appService.rollback(
      req.user.tenantId,
      appId,
      versionId,
      req.user.id,
    );
    return { ok: true as const, data: version };
  }
}
