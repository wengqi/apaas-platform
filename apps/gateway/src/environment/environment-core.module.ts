import { Module } from '@nestjs/common';
import { EnvironmentResolverService } from './environment-resolver.service.js';

/**
 * 环境核心模块（R1.4）——只含环境解析器（无业务依赖），独立成文件以避免
 * 与 ProcessModule 等业务模块的模块文件级循环导入。
 */
@Module({
  providers: [EnvironmentResolverService],
  exports: [EnvironmentResolverService],
})
export class EnvironmentCoreModule {}
