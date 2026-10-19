import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ApplicationService } from './application.service.js';
import { ChangeLogService } from './changelog.service.js';
import { CreateAppDto, UpdateAppGroupDto, UpdateAppDto, PublishAppDto } from './dto/app.dto.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

/**
 * 应用控制器（设计面）— Application CRUD + 发布/预检/版本管理（ADR-0005 /design 命名空间）。
 * 查询路由仅认证即可；管理类路由需 PAGE:MANAGE 权限。
 * 列表/详情为搭建者全量语义（含 DRAFT/ARCHIVED）；终端用户读取走 ApplicationController（/apps）。
 */
@ApiTags('Application (design)')
@ApiBearerAuth()
@Controller('design/apps')
@UseGuards(PermissionGuard)
export class DesignApplicationController {
  constructor(
    private readonly appService: ApplicationService,
    private readonly changeLogService: ChangeLogService,
  ) {}

  // ===========================================================================
  // 应用 CRUD
  // ===========================================================================

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const data = await this.appService.list(requireTenantId(req));
    return { ok: true as const, data };
  }

  @Get(':appId')
  async get(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const app = await this.appService.get(requireTenantId(req), appId);
    return { ok: true as const, data: app };
  }

  @Patch('groups')
  @RequirePermission('PAGE', 'MANAGE')
  @ApiOperation({ summary: '分组管理：重命名（from→to）或删除分组（to 空 → 移入未分组）' })
  async updateGroup(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateAppGroupDto,
  ): Promise<{ ok: true; data: { updated: number } }> {
    const data = await this.appService.updateGroup(requireTenantId(req), body.from, body.to);
    return { ok: true as const, data };
  }

  @Post()
  @RequirePermission('PAGE', 'MANAGE')
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateAppDto) {
    const app = await this.appService.create(requireTenantId(req), req.user.id, body);
    return { ok: true as const, data: app };
  }

  @Put(':appId')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: UpdateAppDto,
  ) {
    const app = await this.appService.update(requireTenantId(req), appId, body, req.user.id);
    return { ok: true as const, data: app };
  }

  @Delete(':appId')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async delete(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    await this.appService.delete(requireTenantId(req), appId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post(':appId/archive')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async archive(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const app = await this.appService.archive(requireTenantId(req), appId, req.user.id);
    return { ok: true as const, data: app };
  }

  // ===========================================================================
  // 预检
  // ===========================================================================

  @Post(':appId/check')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  async check(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const result = await this.appService.check(requireTenantId(req), appId, req.user.id);
    return { ok: true as const, data: result };
  }

  @Get(':appId/checks')
  async listChecks(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const checks = await this.appService.listChecks(requireTenantId(req), appId);
    return { ok: true as const, data: checks };
  }

  // ===========================================================================
  // 变更追踪
  // ===========================================================================

  @Get(':appId/changes')
  async getChanges(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const changeSet = await this.changeLogService.getChangeSet(requireTenantId(req), appId);
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
    @Body() body: PublishAppDto,
  ) {
    const version = await this.appService.publish(requireTenantId(req), appId, req.user.id, body);
    return { ok: true as const, data: version };
  }

  @Get(':appId/versions')
  async listVersions(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const versions = await this.appService.listVersions(requireTenantId(req), appId);
    return { ok: true as const, data: versions };
  }

  @Get(':appId/versions/:versionId')
  async getVersion(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('versionId') versionId: string,
  ) {
    const version = await this.appService.getVersion(requireTenantId(req), appId, versionId);
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
      requireTenantId(req),
      appId,
      versionId,
      req.user.id,
    );
    return { ok: true as const, data: version };
  }
}
