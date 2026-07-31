import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { OrgService } from './org.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

@Controller('permissions/orgs')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  async getTree(@Req() req: AuthenticatedRequest) {
    return { ok: true, data: await this.orgService.getTree(req.user.tenantId) };
  }

  @Get(':id')
  async getNode(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.orgService.getNode(req.user.tenantId, id) };
  }

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: {
    parentId?: string; name: string; code: string; nodeType?: string; sort?: number;
  }) {
    return { ok: true, data: await this.orgService.create(req.user.tenantId, body) };
  }

  @Put(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; sort?: number; parentId?: string },
  ) {
    return { ok: true, data: await this.orgService.update(req.user.tenantId, id, body) };
  }

  @Delete(':id')
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.orgService.delete(req.user.tenantId, id);
    return { ok: true, data: null };
  }

  @Post(':id/move')
  async move(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { parentId: string },
  ) {
    return { ok: true, data: await this.orgService.moveNode(req.user.tenantId, id, body.parentId) };
  }

  @Get(':id/members')
  async getMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return { ok: true, data: await this.orgService.getMembers(req.user.tenantId, id) };
  }

  @Post(':id/members')
  async addMember(@Param('id') id: string, @Body() body: { userId: string }) {
    await this.orgService.addMember(id, body.userId);
    return { ok: true, data: null };
  }

  @Delete(':id/members/:userId')
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    await this.orgService.removeMember(id, userId);
    return { ok: true, data: null };
  }

  @Post(':id/roles')
  async grantRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { roleId: string; appId?: string },
  ) {
    await this.orgService.grantRole(req.user.tenantId, id, body.roleId, body.appId);
    return { ok: true, data: null };
  }

  @Delete(':id/roles/:roleId')
  async revokeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    await this.orgService.revokeRole(id, roleId);
    return { ok: true, data: null };
  }
}
