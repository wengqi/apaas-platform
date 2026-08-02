import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller.js';

/**
 * 流程服务：自研执行引擎核心。
 *
 * 两层架构（对齐飞书 aPaaS）：
 *  1. 执行内核：状态机引擎 + BullMQ 异步队列
 *  2. （前端 UI 在 packages/studio，非此服务）
 *
 * Phase 0 骨架 + 引擎自检端点。Phase 3 填充完整执行逻辑。
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class ProcessModule {}
