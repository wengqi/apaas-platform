import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PageService } from './page.service.js';
import { CreatePageDto, UpdatePageDto } from './dto/page.dto.js';

/**
 * 页面控制器 — 页面 Schema 存取 CRUD。
 *
 * 路由跨多个基路径(apps/:appId/pages、pages/:pageId)，
 * 故使用空基路径 + 每个方法指定完整路径。所有路由受 JWT 保护。
 *
 *   GET    /api/v1/apps/:appId/pages          — 列出应用下页面
 *   POST   /api/v1/apps/:appId/pages          — 创建页面
 *   GET    /api/v1/pages/:pageId              — 获取页面详情(含 Schema)
 *   PUT    /api/v1/pages/:pageId              — 更新页面(含保存 Schema，自动捕获保存点)
 *   DELETE /api/v1/pages/:pageId              — 删除页面
 *   POST   /api/v1/pages/:pageId/publish      — 发布页面
 *   GET    /api/v1/pages/:pageId/save-points  — 保存点列表（飞书式历史）
 *   POST   /api/v1/pages/:pageId/save-points/:savePointId/restore — 恢复到保存点
 */
@ApiTags('Page')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class PageController {
  constructor(private readonly pageService: PageService) {}

  @Get('apps/:appId/pages')
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const pages = await this.pageService.list(requireTenantId(req), appId);
    return { ok: true as const, data: pages };
  }

  @Post('apps/:appId/pages')
  @RequirePermission('PAGE', 'CREATE')
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreatePageDto,
  ) {
    const page = await this.pageService.create(requireTenantId(req), appId, body, req.user.id);
    return { ok: true as const, data: page };
  }

  @Get('pages/:pageId')
  async get(@Req() req: AuthenticatedRequest, @Param('pageId') pageId: string) {
    const page = await this.pageService.get(requireTenantId(req), pageId);
    return { ok: true as const, data: page };
  }

  @Get('apps/:appId/pages/runtime/:pageId')
  async getRuntime(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
  ) {
    // R1.4 运行时按 ID 读页面（审批页渲染）：环境 bundle 优先，降级活表
    const page = await this.pageService.getRuntimeById(requireTenantId(req), appId, pageId);
    return { ok: true as const, data: page };
  }

  @Get('apps/:appId/pages/slug/:slug')
  async getBySlug(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('slug') slug: string,
  ) {
    // 运行态环境隔离：从已发布快照读取页面，而非开发态 PageMeta
    const page = await this.pageService.getPublishedBySlug(requireTenantId(req), appId, slug);
    return { ok: true as const, data: page };
  }

  @Put('pages/:pageId')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('pageId') pageId: string,
    @Body() body: UpdatePageDto,
  ) {
    const page = await this.pageService.update(requireTenantId(req), pageId, body, req.user.id);
    return { ok: true as const, data: page };
  }

  @Delete('pages/:pageId')
  @RequirePermission('PAGE', 'DELETE', 'pageId')
  async delete(@Req() req: AuthenticatedRequest, @Param('pageId') pageId: string) {
    await this.pageService.delete(requireTenantId(req), pageId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  @Post('pages/:pageId/publish')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async publish(@Req() req: AuthenticatedRequest, @Param('pageId') pageId: string) {
    const page = await this.pageService.publish(requireTenantId(req), pageId);
    return { ok: true as const, data: page };
  }

  @Get('pages/:pageId/save-points')
  async listSavePoints(@Req() req: AuthenticatedRequest, @Param('pageId') pageId: string) {
    const points = await this.pageService.listSavePoints(requireTenantId(req), pageId);
    return { ok: true as const, data: points };
  }

  @Post('pages/:pageId/save-points/:savePointId/restore')
  @RequirePermission('PAGE', 'EDIT', 'pageId')
  async restoreSavePoint(
    @Req() req: AuthenticatedRequest,
    @Param('pageId') pageId: string,
    @Param('savePointId') savePointId: string,
  ) {
    const page = await this.pageService.restoreSavePoint(
      requireTenantId(req),
      pageId,
      savePointId,
      req.user.id,
    );
    return { ok: true as const, data: page };
  }
}
