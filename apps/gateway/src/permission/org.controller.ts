import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { OrgService } from './org.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import {
  CreateOrgDto,
  UpdateOrgDto,
  MoveOrgDto,
  AddOrgMemberDto,
  GrantOrgRoleDto,
} from './dto/org.dto.js';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('permissions/orgs')
// 类级不再统一 TenantAdminGuard：组织树（id/name/children）是搭建器组织审批
// （ORG 受理人，引擎专题 R2）选择器的基础数据，普通成员可读——
// 走查实测：builder 打开画布 ORG 下拉时 /permissions/orgs 403，下拉静默为空
// （#12 角色下拉同款缺陷）；写操作与成员/角色授权明细仍要求租户管理员（方法级守卫）。
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getTree(@Req() req: AuthenticatedRequest) {
    return { ok: true as const, data: await this.orgService.getTree(requireTenantId(req)) };
  }

  @UseGuards(TenantAdminGuard)
  @Get(':id/roles')
  async getRoleGrants(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return {
      ok: true as const,
      data: await this.orgService.getRoleGrants(requireTenantId(req), id),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getNode(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true as const, data: await this.orgService.getNode(requireTenantId(req), id) };
  }

  @UseGuards(TenantAdminGuard)
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: CreateOrgDto,
  ) {
    return { ok: true as const, data: await this.orgService.create(requireTenantId(req), body) };
  }

  @UseGuards(TenantAdminGuard)
  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateOrgDto,
  ) {
    return {
      ok: true as const,
      data: await this.orgService.update(requireTenantId(req), id, body),
    };
  }

  @UseGuards(TenantAdminGuard)
  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.orgService.delete(requireTenantId(req), id);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Post(':id/move')
  async move(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: MoveOrgDto) {
    return {
      ok: true as const,
      data: await this.orgService.moveNode(requireTenantId(req), id, body.parentId),
    };
  }

  @UseGuards(TenantAdminGuard)
  @Get(':id/members')
  async getMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true as const, data: await this.orgService.getMembers(requireTenantId(req), id) };
  }

  @UseGuards(TenantAdminGuard)
  @Post(':id/members')
  async addMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddOrgMemberDto,
  ) {
    await this.orgService.addMember(requireTenantId(req), id, body.userId);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Delete(':id/members/:userId')
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.orgService.removeMember(requireTenantId(req), id, userId);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Post(':id/roles')
  async grantRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: GrantOrgRoleDto,
  ) {
    await this.orgService.grantRole(requireTenantId(req), id, body.roleId, body.appId);
    return { ok: true as const, data: null };
  }

  @UseGuards(TenantAdminGuard)
  @Delete(':id/roles/:roleId')
  async revokeRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ) {
    await this.orgService.revokeRole(requireTenantId(req), id, roleId);
    return { ok: true as const, data: null };
  }
}
