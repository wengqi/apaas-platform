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
import type { CreateAppRequest, UpdateAppRequest } from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

/**
 * 应用控制器 — Application CRUD。
 * 所有路由受 PermissionGuard 保护（认证 + 授权），从 token 中提取 tenantId。
 * 查询路由仅认证即可；管理类路由需 MANAGE 权限。
 */
@Controller('apps')
@UseGuards(PermissionGuard)
export class ApplicationController {
  constructor(private readonly appService: ApplicationService) {}

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
}
