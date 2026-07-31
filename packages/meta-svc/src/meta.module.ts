import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller.js';

/**
 * 元数据服务：对象/字段/视图/页面/流程定义的 CRUD。
 * Phase 0 骨架，Phase 1 填充对象建模完整逻辑。
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class MetaModule {}
