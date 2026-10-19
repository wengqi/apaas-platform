import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PageService } from './page.service.js';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto.js';

/**
 * 页面控制器（设计面）— 页面 Schema 存取 CRUD（ADR-0005 /design 命名空间，全部嵌套在应用下）。
 * 读活表开发态；运行时读已发布 bundle 走 PageController（/apps/:appId/pages）。
 *
 *   GET    /api/v1/design/apps/:appId/pages                      — 列出应用下页面（含草稿）
 *   POST   /api/v1/design/apps/:appId/pages                      — 创建页面
 *   GET    /api/v1/design/apps/:appId/pages/:pageId              — 页面详情(含 Schema)
 *   PUT    /api/v1/design/apps/:appId/pages/:pageId              — 更新页面(含保存 Schema，自动捕获保存点)
 *   DELETE /api/v1/design/apps/:appId/pages/:pageId              — 删除页面
 *   POST   /api/v1/design/apps/:appId/pages/:pageId/publish      — 发布页面
 *   GET    /api/v1/design/apps/:appId/pages/:pageId/save-points  — 保存点列表（飞书式历史）
 *   POST   /api/v1/design/apps/:appId/pages/:pageId/save-points/:savePointId/restore — 恢复到保存点
 */
@ApiTags('Page (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/pages')
@UseGuards(PermissionGuard)
export class DesignPageController {
  constructor(private readonly pageService: PageService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const pages = await this.pageService.list(requireTenantId(req), appId);
    return { ok: true as const, data: pages };
  }

  @Post()
  @RequirePermission('PAGE', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreatePageDto,
  ) {
    const page = await this.pageService.create(requireTenantId(req), appId, body, req.user.id);
    return { ok: true as const, data: page };
  }

  @Get(':pageId')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
  ) {
    const page = await this.pageService.get(requireTenantId(req), appId, pageId);
    return { ok: true as const, data: page };
  }

  @Put(':pageId')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
    @Body() body: UpdatePageDto,
  ) {
    const page = await this.pageService.update(
      requireTenantId(req),
      appId,
      pageId,
      body,
      req.user.id,
    );
    return { ok: true as const, data: page };
  }

  @Delete(':pageId')
  @RequirePermission('PAGE', 'DELETE', 'pageId')
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
  ) {
    await this.pageService.delete(requireTenantId(req), appId, pageId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post(':pageId/publish')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async publish(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
  ) {
    const page = await this.pageService.publish(requireTenantId(req), appId, pageId);
    return { ok: true as const, data: page };
  }

  @Get(':pageId/save-points')
  async listSavePoints(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
  ) {
    const points = await this.pageService.listSavePoints(requireTenantId(req), appId, pageId);
    return { ok: true as const, data: points };
  }

  @Post(':pageId/save-points/:savePointId/restore')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async restoreSavePoint(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
    @Param('savePointId') savePointId: string,
  ) {
    const page = await this.pageService.restoreSavePoint(
      requireTenantId(req),
      appId,
      pageId,
      savePointId,
      req.user.id,
    );
    return { ok: true as const, data: page };
  }
}
