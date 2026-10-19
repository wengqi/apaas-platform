import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PageService } from './page.service.js';

/**
 * 页面控制器（运行面）— 终端用户/嵌入宿主读取已发布页面（ADR-0005 design/runtime 双命名空间）。
 * 三个读方法同源：环境指针指向的已发布 bundle，未部署 / 不在 bundle 即 404，无活表兜底。
 * 搭建 CRUD 在 DesignPageController（/design/apps/:appId/pages）。
 *
 *   GET /api/v1/apps/:appId/pages             — 已发布页面列表（页签导航）
 *   GET /api/v1/apps/:appId/pages/:pageId     — 已发布页面详情（审批页按 ID 渲染）
 *   GET /api/v1/apps/:appId/pages/slug/:slug  — 已发布页面详情（按 slug 路由）
 */
@ApiTags('Page (runtime)')
@ApiBearerAuth()
@Controller('apps/:appId/pages')
@UseGuards(PermissionGuard)
export class PageController {
  constructor(private readonly pageService: PageService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const pages = await this.pageService.listRuntime(requireTenantId(req), appId);
    return { ok: true as const, data: pages };
  }

  @Get('slug/:slug')
  async getBySlug(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('slug') slug: string,
  ) {
    const page = await this.pageService.getPublishedBySlug(requireTenantId(req), appId, slug);
    return { ok: true as const, data: page };
  }

  @Get(':pageId')
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('pageId') pageId: string,
  ) {
    const page = await this.pageService.getRuntimeById(requireTenantId(req), appId, pageId);
    return { ok: true as const, data: page };
  }
}
