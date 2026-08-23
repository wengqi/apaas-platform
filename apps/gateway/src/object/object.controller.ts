import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { ObjectService } from './object.service.js';
import { CreateObjectDto, UpdateObjectDto } from './dto/object.dto.js';
import { CreateFieldDto, UpdateFieldDto } from './dto/field.dto.js';
import { CreateViewDto, UpdateViewDto } from './dto/view.dto.js';

/**
 * 对象控制器 — 对象 / 字段 / 视图 CRUD。
 *
 * 路由跨多个基路径(apps/:appId/objects、objects/:objectId、views/:viewId)，
 * 故使用空基路径 + 每个方法指定完整路径。所有路由受 JWT 保护。
 *
 * 对象 CRUD:
 *   GET    /api/v1/apps/:appId/objects          — 列出对象
 *   POST   /api/v1/apps/:appId/objects          — 创建对象
 *   GET    /api/v1/objects/:objectId            — 获取对象详情
 *   PUT    /api/v1/objects/:objectId            — 更新对象
 *   DELETE /api/v1/objects/:objectId            — 删除对象
 *
 * 字段 CRUD:
 *   POST   /api/v1/objects/:objectId/fields     — 新增字段
 *   PUT    /api/v1/objects/:objectId/fields/:fieldId — 更新字段
 *   DELETE /api/v1/objects/:objectId/fields/:fieldId — 删除字段
 *
 * 视图 CRUD:
 *   GET    /api/v1/objects/:objectId/views      — 列出视图
 *   POST   /api/v1/objects/:objectId/views      — 创建视图
 *   PUT    /api/v1/views/:viewId               — 更新视图
 *   DELETE /api/v1/views/:viewId               — 删除视图
 */
@ApiTags('Object')
@ApiBearerAuth()
@Controller()
@UseGuards(PermissionGuard)
export class ObjectController {
  constructor(private readonly objectService: ObjectService) {}

  // ===========================================================================
  // 对象 CRUD
  // ===========================================================================

  @Get('apps/:appId/objects')
  async listObjects(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const objects = await this.objectService.list(requireTenantId(req), appId);
    return { ok: true as const, data: objects };
  }

  @Post('apps/:appId/objects')
  @RequirePermission('DATA_MODEL', 'CREATE')
  async createObject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateObjectDto,
  ) {
    const object = await this.objectService.create(requireTenantId(req), appId, req.user.id, body);
    return { ok: true as const, data: object };
  }

  @Get('objects/:objectId')
  async getObject(@Req() req: AuthenticatedRequest, @Param('objectId') objectId: string) {
    const object = await this.objectService.get(requireTenantId(req), objectId);
    return { ok: true as const, data: object };
  }

  @Put('objects/:objectId')
  @RequirePermission('DATA_MODEL', 'EDIT', 'objectId')
  async updateObject(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: UpdateObjectDto,
  ) {
    const object = await this.objectService.update(
      requireTenantId(req),
      objectId,
      body,
      req.user.id,
    );
    return { ok: true as const, data: object };
  }

  @Delete('objects/:objectId')
  @RequirePermission('DATA_MODEL', 'DELETE', 'objectId')
  async deleteObject(@Req() req: AuthenticatedRequest, @Param('objectId') objectId: string) {
    await this.objectService.delete(requireTenantId(req), objectId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 字段 CRUD
  // ===========================================================================

  @Post('objects/:objectId/fields')
  @RequirePermission('DATA_MODEL', 'CREATE', 'objectId')
  async addField(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: CreateFieldDto,
  ) {
    const field = await this.objectService.addField(requireTenantId(req), objectId, body);
    return { ok: true as const, data: field };
  }

  @Put('objects/:objectId/fields/:fieldId')
  @RequirePermission('DATA_MODEL', 'EDIT', 'objectId')
  async updateField(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: UpdateFieldDto,
  ) {
    const field = await this.objectService.updateField(
      requireTenantId(req),
      objectId,
      fieldId,
      body,
    );
    return { ok: true as const, data: field };
  }

  @Delete('objects/:objectId/fields/:fieldId')
  @RequirePermission('DATA_MODEL', 'DELETE', 'objectId')
  async deleteField(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Param('fieldId') fieldId: string,
  ) {
    await this.objectService.deleteField(requireTenantId(req), objectId, fieldId);
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 视图 CRUD
  // ===========================================================================

  @Get('objects/:objectId/views')
  async listViews(@Req() req: AuthenticatedRequest, @Param('objectId') objectId: string) {
    const views = await this.objectService.listViews(requireTenantId(req), objectId);
    return { ok: true as const, data: views };
  }

  @Post('objects/:objectId/views')
  @RequirePermission('DATA_MODEL', 'CREATE', 'objectId')
  async createView(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: CreateViewDto,
  ) {
    const view = await this.objectService.createView(requireTenantId(req), objectId, body);
    return { ok: true as const, data: view };
  }

  @Put('views/:viewId')
  @RequirePermission('DATA_MODEL', 'EDIT')
  async updateView(
    @Req() req: AuthenticatedRequest,
    @Param('viewId') viewId: string,
    @Body() body: UpdateViewDto,
  ) {
    const view = await this.objectService.updateView(requireTenantId(req), viewId, body);
    return { ok: true as const, data: view };
  }

  @Delete('views/:viewId')
  @RequirePermission('DATA_MODEL', 'DELETE')
  async deleteView(@Req() req: AuthenticatedRequest, @Param('viewId') viewId: string) {
    await this.objectService.deleteView(requireTenantId(req), viewId);
    return { ok: true as const, data: { deleted: true } };
  }
}
