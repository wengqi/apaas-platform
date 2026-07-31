import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller.js';

/**
 * 运行时服务：业务记录 CRUD、动态查询、表达式计算。
 * Phase 0 骨架，Phase 1 填充记录 API + JSONB 查询逻辑。
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class RuntimeModule {}
