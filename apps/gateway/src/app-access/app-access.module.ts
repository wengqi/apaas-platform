import { Module } from '@nestjs/common';
import { AppAccessService } from './app-access.service.js';
import { DesignAccessGuard } from './design-access.guard.js';

/**
 * 应用归属模块（ADR-0005）— AppAccessService + DesignAccessGuard。
 * 零业务依赖（仅 prisma），供全部设计面控制器模块与 MCP 模块导入；
 * 不反向依赖 ApplicationModule 等业务模块，避免循环。
 */
@Module({
  providers: [AppAccessService, DesignAccessGuard],
  exports: [AppAccessService, DesignAccessGuard],
})
export class AppAccessModule {}
