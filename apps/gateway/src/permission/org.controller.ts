import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
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
@UseGuards(TenantAdminGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  async getTree(@Req() req: AuthenticatedRequest) {
    return { ok: true as const, data: await this.orgService.getTree(requireTenantId(req)) };
  }

  @Get(':id/roles')
  async getRoleGrants(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return {
      ok: true as const,
      data: await this.orgService.getRoleGrants(requireTenantId(req), id),
    };
  }

  @Get(':id')
  async getNode(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true as const, data: await this.orgService.getNode(requireTenantId(req), id) };
  }

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: CreateOrgDto,
  ) {
    return { ok: true as const, data: await this.orgService.create(requireTenantId(req), body) };
  }

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

  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.orgService.delete(requireTenantId(req), id);
    return { ok: true as const, data: null };
  }

  @Post(':id/move')
  async move(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: MoveOrgDto) {
    return {
      ok: true as const,
      data: await this.orgService.moveNode(requireTenantId(req), id, body.parentId),
    };
  }

  @Get(':id/members')
  async getMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true as const, data: await this.orgService.getMembers(requireTenantId(req), id) };
  }

  @Post(':id/members')
  async addMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: AddOrgMemberDto,
  ) {
    await this.orgService.addMember(requireTenantId(req), id, body.userId);
    return { ok: true as const, data: null };
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    await this.orgService.removeMember(requireTenantId(req), id, userId);
    return { ok: true as const, data: null };
  }

  @Post(':id/roles')
  async grantRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: GrantOrgRoleDto,
  ) {
    await this.orgService.grantRole(requireTenantId(req), id, body.roleId, body.appId);
    return { ok: true as const, data: null };
  }

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
