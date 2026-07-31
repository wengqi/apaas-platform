import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { RoleService } from './role.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

@Controller('permissions/roles')
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('appId') appId?: string) {
    const roles = await this.roleService.list(req.user.tenantId, appId);
    return { ok: true, data: roles };
  }

  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.roleService.get(req.user.tenantId, id) };
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: {
    name: string; code: string; description?: string; appId?: string;
  }) {
    return { ok: true, data: await this.roleService.create(req.user.tenantId, body) };
  }

  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return { ok: true, data: await this.roleService.update(req.user.tenantId, id, body) };
  }

  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.roleService.delete(req.user.tenantId, id);
    return { ok: true, data: null };
  }

  @Get(':id/users')
  async getUsers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.roleService.getUsers(req.user.tenantId, id) };
  }

  @Post(':id/users')
  async assignUsers(@Param('id') id: string, @Body() body: { userIds: string[] }) {
    await this.roleService.assignUsers(id, body.userIds);
    return { ok: true, data: null };
  }

  @Delete(':id/users/:userId')
  async removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    await this.roleService.removeUser(id, userId);
    return { ok: true, data: null };
  }

  @Get(':id/rules')
  async getRules(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.roleService.getPermissionRules(req.user.tenantId, id) };
  }

  @Put(':id/rules')
  async setRules(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { rules: Array<Record<string, unknown>> },
  ) {
    await this.roleService.setPermissionRules(req.user.tenantId, id, body.rules as never);
    return { ok: true, data: null };
  }
}
