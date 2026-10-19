import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard.js';
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { AppAccessService } from '../app-access/app-access.service.js';
import { AppMemberService } from './app-member.service.js';
import { AppMemberTargetDto } from './dto/app.dto.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';

/**
 * 应用成员控制器（设计面，ADR-0005）— 成员清单 / 候选集 / 增删 / 所有权转移。
 * 清单对全部成员可读；候选集与写操作为所有者级（admin | owner）。
 *
 *   GET    /api/v1/design/apps/:appId/members             — 成员清单
 *   GET    /api/v1/design/apps/:appId/members/candidates  — 可添加候选（租户级 BUILDER 未入会）
 *   POST   /api/v1/design/apps/:appId/members             — 添加协作者 { userId }
 *   POST   /api/v1/design/apps/:appId/members/owner       — 转移所有权 { userId }
 *   DELETE /api/v1/design/apps/:appId/members/:userId     — 移除协作者
 */
@ApiTags('Application Members (design)')
@ApiBearerAuth()
@Controller('design/apps/:appId/members')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class DesignAppMemberController {
  constructor(
    private readonly members: AppMemberService,
    private readonly appAccess: AppAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: '成员清单（OWNER 在前）' })
  async list(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const data = await this.members.listMembers(requireTenantId(req), appId);
    return { ok: true as const, data };
  }

  // 字面量段在前，避免被 DELETE :userId 之外的参数路由吞掉（GET 下无冲突，保持约定）
  @Get('candidates')
  @ApiOperation({ summary: '可添加候选：租户级 BUILDER 且未加入本应用（所有者级）' })
  async candidates(@Req() req: AuthenticatedRequest, @Param('appId') appId: string) {
    const tenantId = requireTenantId(req);
    await this.appAccess.assertOwnerAccess(req.user, tenantId, appId);
    const data = await this.members.candidates(tenantId, appId);
    return { ok: true as const, data };
  }

  @Post()
  @ApiOperation({ summary: '添加协作者（所有者级）' })
  async add(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: AppMemberTargetDto,
  ) {
    const tenantId = requireTenantId(req);
    await this.appAccess.assertOwnerAccess(req.user, tenantId, appId);
    const data = await this.members.addMember(tenantId, appId, body.userId, req.user.id);
    return { ok: true as const, data };
  }

  @Post('owner')
  @ApiOperation({ summary: '转移所有权（所有者级）：原所有者降为协作者' })
  async transferOwner(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() body: AppMemberTargetDto,
  ) {
    const tenantId = requireTenantId(req);
    await this.appAccess.assertOwnerAccess(req.user, tenantId, appId);
    await this.members.transferOwnership(tenantId, appId, body.userId, req.user.id);
    return { ok: true as const, data: { ownerUserId: body.userId } };
  }

  @Delete(':userId')
  @ApiOperation({ summary: '移除协作者（所有者级；所有者不可移除，须先转移）' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('userId') userId: string,
  ) {
    const tenantId = requireTenantId(req);
    await this.appAccess.assertOwnerAccess(req.user, tenantId, appId);
    await this.members.removeMember(tenantId, appId, userId, req.user.id);
    return { ok: true as const, data: { removed: true } };
  }
}
