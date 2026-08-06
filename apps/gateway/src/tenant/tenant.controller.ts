import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../auth/platform-admin.guard.js';
import { TenantService } from './tenant.service.js';

/**
 * 租户管理控制器 — 仅平台超管可访问。
 *
 * 端点：
 *   POST   /api/v1/tenants              — 创建租户（自动初始化内置角色+权限规则）
 *   GET    /api/v1/tenants              — 租户列表
 *   GET    /api/v1/tenants/:id          — 租户详情
 *   PATCH  /api/v1/tenants/:id          — 更新租户
 *   POST   /api/v1/tenants/:id/suspend  — 挂起租户
 *   POST   /api/v1/tenants/:id/activate — 激活租户
 *   POST   /api/v1/tenants/:id/admins   — 分配租户管理员
 *   GET    /api/v1/tenants/:id/users    — 租户内用户列表（只读）
 *   GET    /api/v1/tenants/:id/apps     — 租户内应用列表（只读）
 */
@ApiTags('Tenant')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(PlatformAdminGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  async create(@Body() body: { name: string; slug: string; description?: string }) {
    return { ok: true, data: await this.tenantService.create(body) };
  }

  @Get()
  async list() {
    return { ok: true, data: await this.tenantService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { ok: true, data: await this.tenantService.get(id) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; description?: string }) {
    return { ok: true, data: await this.tenantService.update(id, body) };
  }

  @Post(':id/suspend')
  async suspend(@Param('id') id: string) {
    return { ok: true, data: await this.tenantService.suspend(id) };
  }

  @Post(':id/activate')
  async activate(@Param('id') id: string) {
    return { ok: true, data: await this.tenantService.activate(id) };
  }

  @Post(':id/admins')
  async assignAdmin(
    @Param('id') id: string,
    @Body() body: { email: string; name: string; password: string },
  ) {
    return { ok: true, data: await this.tenantService.assignAdmin(id, body) };
  }

  @Get(':id/users')
  async getUsers(@Param('id') id: string) {
    return { ok: true, data: await this.tenantService.getUsers(id) };
  }

  @Get(':id/apps')
  async getApps(@Param('id') id: string) {
    return { ok: true, data: await this.tenantService.getApps(id) };
  }
}
