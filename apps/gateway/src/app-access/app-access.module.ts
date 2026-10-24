import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module.js';
import { AppAccessService } from './app-access.service.js';
import { DesignAccessGuard } from './design-access.guard.js';
import { DataAppAccessGuard } from './data-app-access.guard.js';

/**
 * 应用归属模块（ADR-0005）— AppAccessService + DesignAccessGuard + DataAppAccessGuard。
 * 仅依赖 prisma + PermissionModule（运行面可见性归纳的 getUserRoleIds），
 * 供全部设计面控制器模块、数据面控制器模块与 MCP 模块导入；
 * 不反向依赖 ApplicationModule 等业务模块，避免循环。
 */
@Module({
  imports: [PermissionModule],
  providers: [AppAccessService, DesignAccessGuard, DataAppAccessGuard],
  exports: [AppAccessService, DesignAccessGuard, DataAppAccessGuard],
})
export class AppAccessModule {}
