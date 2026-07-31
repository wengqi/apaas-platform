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
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { ObjectService } from './object.service.js';
import type {
  CreateObjectInput,
  UpdateObjectInput,
  CreateFieldInput,
  UpdateFieldInput,
  CreateViewInput,
  UpdateViewInput,
} from './object.service.js';

/**
 * 对象控制器 — 对象 / 字段 / 视图 CRUD。
 *
 * 路由跨多个基路径(apps/:appId/objects、objects/:objectId、views/:viewId)，
 * 故使用空基路径 + 每个方法指定完整路径。所有路由受 JWT 保护。
 *
 * 对象 CRUD:
 *   GET    /api/apps/:appId/objects          — 列出对象
 *   POST   /api/apps/:appId/objects          — 创建对象
 *   GET    /api/objects/:objectId            — 获取对象详情
 *   PUT    /api/objects/:objectId            — 更新对象
 *   DELETE /api/objects/:objectId            — 删除对象
 *
 * 字段 CRUD:
 *   POST   /api/objects/:objectId/fields     — 新增字段
 *   PUT    /api/objects/:objectId/fields/:fieldId — 更新字段
 *   DELETE /api/objects/:objectId/fields/:fieldId — 删除字段
 *
 * 视图 CRUD:
 *   GET    /api/objects/:objectId/views      — 列出视图
 *   POST   /api/objects/:objectId/views      — 创建视图
 *   PUT    /api/views/:viewId               — 更新视图
 *   DELETE /api/views/:viewId               — 删除视图
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class ObjectController {
  constructor(private readonly objectService: ObjectService) {}

  // ===========================================================================
  // 对象 CRUD
  // ===========================================================================

  @Get('apps/:appId/objects')
  async listObjects(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ) {
    const objects = await this.objectService.list(req.user.tenantId, appId);
    return { ok: true as const, data: objects };
  }

  @Post('apps/:appId/objects')
  async createObject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: CreateObjectInput,
  ) {
    const object = await this.objectService.create(
      req.user.tenantId,
      appId,
      req.user.id,
      body,
    );
    return { ok: true as const, data: object };
  }

  @Get('objects/:objectId')
  async getObject(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
  ) {
    const object = await this.objectService.get(req.user.tenantId, objectId);
    return { ok: true as const, data: object };
  }

  @Put('objects/:objectId')
  async updateObject(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: UpdateObjectInput,
  ) {
    const object = await this.objectService.update(
      req.user.tenantId,
      objectId,
      body,
    );
    return { ok: true as const, data: object };
  }

  @Delete('objects/:objectId')
  async deleteObject(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
  ) {
    await this.objectService.delete(req.user.tenantId, objectId);
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 字段 CRUD
  // ===========================================================================

  @Post('objects/:objectId/fields')
  async addField(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Body() body: CreateFieldInput,
  ) {
    const field = await this.objectService.addField(
      req.user.tenantId,
      objectId,
      body,
    );
    return { ok: true as const, data: field };
  }

  @Put('objects/:objectId/fields/:fieldId')
  async updateField(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: UpdateFieldInput,
  ) {
    const field = await this.objectService.updateField(
      req.user.tenantId,
      objectId,
      fieldId,
      body,
    );
    return { ok: true as const, data: field };
  }

  @Delete('objects/:objectId/fields/:fieldId')
  async deleteField(
    @Req() req: AuthenticatedRequest,
    @Param('objectId') objectId: string,
    @Param('fieldId') fieldId: string,
  ) {
    await this.objectService.deleteField(
      req.user.tenantId,
      objectId,
      fieldId,
    );
    return { ok: true as const, data: { deleted: true } };
  }

  // ===========================================================================
  // 视图 CRUD
  // ===========================================================================

  @Get('objects/:objectId/views')
  async listViews(@Param('objectId') objectId: string) {
    const views = await this.objectService.listViews(objectId);
    return { ok: true as const, data: views };
  }

  @Post('objects/:objectId/views')
  async createView(
    @Param('objectId') objectId: string,
    @Body() body: CreateViewInput,
  ) {
    const view = await this.objectService.createView(objectId, body);
    return { ok: true as const, data: view };
  }

  @Put('views/:viewId')
  async updateView(
    @Param('viewId') viewId: string,
    @Body() body: UpdateViewInput,
  ) {
    const view = await this.objectService.updateView(viewId, body);
    return { ok: true as const, data: view };
  }

  @Delete('views/:viewId')
  async deleteView(@Param('viewId') viewId: string) {
    await this.objectService.deleteView(viewId);
    return { ok: true as const, data: { deleted: true } };
  }
}

