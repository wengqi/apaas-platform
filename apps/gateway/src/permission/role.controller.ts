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
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { RoleService } from './role.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignRoleUsersDto,
  SetRoleRulesDto,
} from './dto/role.dto.js';

@ApiTags('Role')
@ApiBearerAuth()
@Controller('permissions/roles')
// 类级不再统一 TenantAdminGuard：角色列表（id/name/code）是搭建器审批人选择等
// 场景的基础数据，普通成员可读（A 旅程实测 #12：builder 配审批角色 403 空下拉）；
// 写操作与成员/规则明细仍要求租户管理员（方法级守卫）。
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('appId') appId?: string) {
    const roles = await this.roleService.list(requireTenantId(req), appId);
    return { ok: true as const, data: roles };
  }

  @UseGuards(TenantAdminGuard)
  @Get(':id')
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true as const, data: await this.roleService.get(requireTenantId(req), id) };
  }

  @UseGuards(TenantAdminGuard)
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: CreateRoleDto,
  ) {
    return { ok: true as const, data: await this.roleService.create(requireTenantId(req), body) };
  }

  @UseGuards(TenantAdminGuard)
  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return {
      ok: true as const,
      data: await this.roleService.update(requireTenantId(req), id, body),
    };
  }

  @UseGuards(TenantAdminGuard)
  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.roleService.delete(requireTenantId(req), id);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Get(':id/users')
  async getUsers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true as const, data: await this.roleService.getUsers(requireTenantId(req), id) };
  }

  @UseGuards(TenantAdminGuard)
  @Post(':id/users')
  async assignUsers(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AssignRoleUsersDto,
  ) {
    await this.roleService.assignUsers(requireTenantId(req), id, body.userIds);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Delete(':id/users/:userId')
  async removeUser(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.roleService.removeUser(requireTenantId(req), id, userId);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Get(':id/rules')
  async getRules(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return {
      ok: true as const,
      data: await this.roleService.getPermissionRules(requireTenantId(req), id),
    };
  }

  @UseGuards(TenantAdminGuard)
  @Put(':id/rules')
  async setRules(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetRoleRulesDto,
  ) {
    await this.roleService.setPermissionRules(requireTenantId(req), id, body.rules as never);
    return { ok: true as const, data: null };
  }
}
