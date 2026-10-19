import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { ObjectService } from './object.service.js';
import { CreateObjectDto, UpdateObjectDto } from './dto/object.dto.js';
import { CreateFieldDto, UpdateFieldDto } from './dto/field.dto.js';
import { CreateViewDto, UpdateViewDto } from './dto/view.dto.js';

/**
 * 对象控制器（设计面）— 对象 / 字段 / 视图 CRUD（ADR-0005 /design 命名空间，全部嵌套在应用下）。
 * 对象定义只有设计面；运行时数据读写走 records（/objects/:objectId/records，运行面不动）。
 *
 * 对象 CRUD:
 *   GET    /api/v1/design/apps/:appId/objects                 — 列出对象
 *   POST   /api/v1/design/apps/:appId/objects                 — 创建对象
 *   GET    /api/v1/design/apps/:appId/objects/:objectId       — 获取对象详情
 *   PUT    /api/v1/design/apps/:appId/objects/:objectId       — 更新对象
 *   DELETE /api/v1/design/apps/:appId/objects/:objectId       — 删除对象
 *
 * 字段 CRUD:
 *   POST   /api/v1/design/apps/:appId/objects/:objectId/fields          — 新增字段
 *   PUT    /api/v1/design/apps/:appId/objects/:objectId/fields/:fieldId — 更新字段
 *   DELETE /api/v1/design/apps/:appId/objects/:objectId/fields/:fieldId — 删除字段
 *
 * 视图 CRUD:
 *   GET    /api/v1/design/apps/:appId/objects/:objectId/views           — 列出视图
 *   POST   /api/v1/design/apps/:appId/objects/:objectId/views           — 创建视图
 *   PUT    /api/v1/design/apps/:appId/objects/:objectId/views/:viewId   — 更新视图
 *   DELETE /api/v1/design/apps/:appId/objects/:objectId/views/:viewId   — 删除视图
 */
@ApiTags('Object (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/objects')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class DesignObjectController {
  constructor(private readonly objectService: ObjectService) {}

  // ===========================================================================
  // 对象 CRUD
  // ===========================================================================

  @Get()
  async listObjects(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const objects = await this.objectService.list(requireTenantId(req), appId);
    return { ok: true as const, data: objects };
  }

  @Post()
  @RequirePermission('DATA_MODEL', 'CREATE')
  async createObject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateObjectDto,
  ) {
    const object = await this.objectService.create(requireTenantId(req), appId, req.user.id, body);
    return { ok: true as const, data: object };
  }

  @Get(':objectId')
  async getObject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
  ) {
    const object = await this.objectService.get(requireTenantId(req), appId, objectId);
    return { ok: true as const, data: object };
  }

  @Put(':objectId')
  @RequirePermission('DATA_MODEL', 'EDIT', 'objectId')
  async updateObject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Body() body: UpdateObjectDto,
  ) {
    const object = await this.objectService.update(
      requireTenantId(req),
      appId,
      objectId,
      body,
      req.user.id,
    );
    return { ok: true as const, data: object };
  }

  @Delete(':objectId')
  @RequirePermission('DATA_MODEL', 'DELETE', 'objectId')
  async deleteObject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
  ) {
    await this.objectService.delete(requireTenantId(req), appId, objectId, req.user.id);
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 字段 CRUD
  // ===========================================================================

  @Post(':objectId/fields')
  @RequirePermission('DATA_MODEL', 'CREATE', 'objectId')
  async addField(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Body() body: CreateFieldDto,
  ) {
    const field = await this.objectService.addField(requireTenantId(req), appId, objectId, body);
    return { ok: true as const, data: field };
  }

  @Put(':objectId/fields/:fieldId')
  @RequirePermission('DATA_MODEL', 'EDIT', 'objectId')
  async updateField(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: UpdateFieldDto,
  ) {
    const field = await this.objectService.updateField(
      requireTenantId(req),
      appId,
      objectId,
      fieldId,
      body,
    );
    return { ok: true as const, data: field };
  }

  @Delete(':objectId/fields/:fieldId')
  @RequirePermission('DATA_MODEL', 'DELETE', 'objectId')
  async deleteField(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Param('fieldId') fieldId: string,
  ) {
    await this.objectService.deleteField(requireTenantId(req), appId, objectId, fieldId);
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 视图 CRUD
  // ===========================================================================

  @Get(':objectId/views')
  async listViews(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
  ) {
    const views = await this.objectService.listViews(requireTenantId(req), appId, objectId);
    return { ok: true as const, data: views };
  }

  @Post(':objectId/views')
  @RequirePermission('DATA_MODEL', 'CREATE', 'objectId')
  async createView(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Body() body: CreateViewDto,
  ) {
    const view = await this.objectService.createView(requireTenantId(req), appId, objectId, body);
    return { ok: true as const, data: view };
  }

  @Put(':objectId/views/:viewId')
  @RequirePermission('DATA_MODEL', 'EDIT', 'objectId')
  async updateView(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Param('viewId') viewId: string,
    @Body() body: UpdateViewDto,
  ) {
    const view = await this.objectService.updateView(
      requireTenantId(req),
      appId,
      objectId,
      viewId,
      body,
    );
    return { ok: true as const, data: view };
  }

  @Delete(':objectId/views/:viewId')
  @RequirePermission('DATA_MODEL', 'DELETE', 'objectId')
  async deleteView(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('objectId') objectId: string,
    @Param('viewId') viewId: string,
  ) {
    await this.objectService.deleteView(requireTenantId(req), appId, objectId, viewId);
    return { ok: true as const, data: { deleted: true } };
  }
}
