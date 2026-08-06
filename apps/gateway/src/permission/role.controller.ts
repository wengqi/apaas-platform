import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
import { RoleService } from './role.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('Role')
@ApiBearerAuth()
@Controller('permissions/roles')
@UseGuards(TenantAdminGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('appId') appId?: string) {
    const roles = await this.roleService.list(requireTenantId(req), appId);
    return { ok: true, data: roles };
  }

  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.roleService.get(requireTenantId(req), id) };
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      name: string;
      code: string;
      description?: string;
      appId?: string;
    },
  ) {
    return { ok: true, data: await this.roleService.create(requireTenantId(req), body) };
  }

  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return { ok: true, data: await this.roleService.update(requireTenantId(req), id, body) };
  }

  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.roleService.delete(requireTenantId(req), id);
    return { ok: true, data: null };
  }

  @Get(':id/users')
  async getUsers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.roleService.getUsers(requireTenantId(req), id) };
  }

  @Post(':id/users')
  async assignUsers(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { userIds: string[] },
  ) {
    await this.roleService.assignUsers(requireTenantId(req), id, body.userIds);
    return { ok: true, data: null };
  }

  @Delete(':id/users/:userId')
  async removeUser(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.roleService.removeUser(requireTenantId(req), id, userId);
    return { ok: true, data: null };
  }

  @Get(':id/rules')
  async getRules(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.roleService.getPermissionRules(requireTenantId(req), id) };
  }

  @Put(':id/rules')
  async setRules(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { rules: Array<Record<string, unknown>> },
  ) {
    await this.roleService.setPermissionRules(requireTenantId(req), id, body.rules as never);
    return { ok: true, data: null };
  }
}
