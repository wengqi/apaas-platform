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
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { PageService } from './page.service.js';
import type { CreatePageRequest, UpdatePageRequest } from '@apaas/shared';

/**
 * 页面控制器 — 页面 Schema 存取 CRUD。
 *
 * 路由跨多个基路径(apps/:appId/pages、pages/:pageId)，
 * 故使用空基路径 + 每个方法指定完整路径。所有路由受 JWT 保护。
 *
 *   GET    /api/apps/:appId/pages          — 列出应用下页面
 *   POST   /api/apps/:appId/pages          — 创建页面
 *   GET    /api/pages/:pageId              — 获取页面详情(含 Schema)
 *   PUT    /api/pages/:pageId              — 更新页面(含保存 Schema)
 *   DELETE /api/pages/:pageId              — 删除页面
 *   POST   /api/pages/:pageId/publish      — 发布页面
 */
@Controller()
@UseGuards(PermissionGuard)
export class PageController {
  constructor(private readonly pageService: PageService) {}

  @Get('apps/:appId/pages')
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ) {
    const pages = await this.pageService.list(req.user.tenantId, appId);
    return { ok: true as const, data: pages };
  }

  @Post('apps/:appId/pages')
  @RequirePermission('PAGE', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreatePageRequest,
  ) {
    const page = await this.pageService.create(
      req.user.tenantId,
      appId,
      body,
    );
    return { ok: true as const, data: page };
  }

  @Get('pages/:pageId')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('pageId') pageId: string,
  ) {
    const page = await this.pageService.get(req.user.tenantId, pageId);
    return { ok: true as const, data: page };
  }

  @Get('apps/:appId/pages/slug/:slug')
  async getBySlug(
    @Req() req: AuthenticatedRequest,
    @Param('appId') _appId: string,
    @Param('slug') slug: string,
  ) {
    const page = await this.pageService.getBySlug(req.user.tenantId, slug);
    return { ok: true as const, data: page };
  }

  @Put('pages/:pageId')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('pageId') pageId: string,
    @Body() body: UpdatePageRequest,
  ) {
    const page = await this.pageService.update(
      req.user.tenantId,
      pageId,
      body,
    );
    return { ok: true as const, data: page };
  }

  @Delete('pages/:pageId')
  @RequirePermission('PAGE', 'DELETE', 'pageId')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('pageId') pageId: string,
  ) {
    await this.pageService.delete(req.user.tenantId, pageId);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post('pages/:pageId/publish')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async publish(
    @Req() req: AuthenticatedRequest,
    @Param('pageId') pageId: string,
  ) {
    const page = await this.pageService.publish(req.user.tenantId, pageId);
    return { ok: true as const, data: page };
  }
}

