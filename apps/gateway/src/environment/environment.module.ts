import { Module } from '@nestjs/common';
import { EnvironmentController } from './environment.controller.js';
import { EnvironmentService } from './environment.service.js';
import { EnvironmentCoreModule } from './environment-core.module.js';
import { ProcessModule } from '../process/process.module.js';
import { PermissionModule } from '../permission/permission.module.js';
import { AppAccessModule } from '../app-access/app-access.module.js';

/**
 * 环境管理模块（R1.4）——发布=切指针 / 回滚 / Deployment / 环境变量。
 * 环境解析器见 environment-core.module.ts（独立文件防循环导入）。
 */
@Module({
  imports: [EnvironmentCoreModule, ProcessModule, PermissionModule, AppAccessModule],
  controllers: [EnvironmentController],
  providers: [EnvironmentService],
  exports: [EnvironmentService],
})
export class EnvironmentModule {}
