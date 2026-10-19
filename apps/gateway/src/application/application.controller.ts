import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { ApplicationService } from './application.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

/**
 * 应用控制器（运行面）— 终端用户视角的应用读取（ADR-0005 design/runtime 双命名空间）。
 *
 * 运行面只暴露"已发布 + 当前用户有权限"的应用，未发布或无权限一律 404；
 * 设计面（搭建、发布、版本、分组等）在 DesignApplicationController（/design/apps）。
 */
@ApiTags('Application (runtime)')
@ApiBearerAuth()
@Controller('apps')
@UseGuards(PermissionGuard)
export class ApplicationController {
  constructor(private readonly appService: ApplicationService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const data = await this.appService.listVisibleForUser(requireTenantId(req), req.user);
    return { ok: true as const, data };
  }

  @Get(':appId')
  async get(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const app = await this.appService.getVisibleForUser(requireTenantId(req), req.user, appId);
    return { ok: true as const, data: app };
  }
}
