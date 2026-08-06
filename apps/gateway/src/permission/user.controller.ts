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
import { UserService } from './user.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

@ApiTags('User')
@ApiBearerAuth()
@Controller('permissions/users')
@UseGuards(TenantAdminGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('keyword') keyword?: string,
    @Query('orgId') orgId?: string,
    @Query('roleId') roleId?: string,
  ) {
    const users = await this.userService.list(requireTenantId(req), { keyword, orgId, roleId });
    return { ok: true, data: users };
  }

  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.userService.get(requireTenantId(req), id) };
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      email: string;
      name: string;
      password: string;
      roleIds?: string[];
      orgIds?: string[];
    },
  ) {
    return { ok: true, data: await this.userService.create(requireTenantId(req), body) };
  }

  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; avatar?: string; status?: string },
  ) {
    return { ok: true, data: await this.userService.update(requireTenantId(req), id, body) };
  }

  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.userService.delete(requireTenantId(req), id);
    return { ok: true, data: null };
  }

  @Put(':id/roles')
  async setRoles(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { roleIds: string[] },
  ) {
    await this.userService.setRoles(requireTenantId(req), id, body.roleIds);
    return { ok: true, data: null };
  }

  @Put(':id/orgs')
  async setOrgs(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { orgIds: string[] },
  ) {
    await this.userService.setOrgs(requireTenantId(req), id, body.orgIds);
    return { ok: true, data: null };
  }
}
