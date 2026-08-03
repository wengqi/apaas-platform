import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';

/**
 * 租户管理模块 — 平台超管管理租户的创建、配置、启停。
 *
 * 所有端点受 PlatformAdminGuard 保护（仅 isPlatformAdmin=true 可访问）。
 */
@Module({
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
