/**
 * 队列模块 — 基于 BullMQ + Redis 的异步任务队列。
 *
 * 注册两个队列：
 * - processQueue：流程令牌推进（startProcess / executeNextNode / completeTask 均入队）
 * - delayQueue：延时节点到时恢复
 *
 * Worker 在模块初始化时自动启动，消费 job 并调用 ProcessEngine。
 * Redis 连接地址从环境变量 REDIS_URL 读取（docker-compose 已配置）。
 *
 * 依赖关系：QueueModule → ProcessModule（Worker 调用 ProcessEngine），
 * ProcessModule → QueueModule（引擎入队），使用 forwardRef 打破循环。
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PROCESS_QUEUE, DELAY_QUEUE, DATASET_QUEUE } from './queue.constants.js';
import { ProcessProcessor } from './process.processor.js';
import { ProcessModule } from '../process/process.module.js';

/** BullMQ 队列工厂 — 创建连接 Redis 的 Queue 实例。 */
function createQueue(queueName: string, connection: IORedis) {
  return new Queue(queueName, { connection });
}

@Module({
  imports: [ConfigModule, forwardRef(() => ProcessModule)],
  providers: [
    {
      provide: 'REDIS_CONNECTION',
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        return new IORedis(url, { maxRetriesPerRequest: null });
      },
      inject: [ConfigService],
    },
    {
      provide: PROCESS_QUEUE,
      useFactory: (_connection: IORedis, config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        // Queue 使用独立连接（不共享 Worker 的 connection）
        return createQueue(PROCESS_QUEUE, new IORedis(url, { maxRetriesPerRequest: null }));
      },
      inject: ['REDIS_CONNECTION', ConfigService],
    },
    {
      provide: DELAY_QUEUE,
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        return createQueue(DELAY_QUEUE, new IORedis(url, { maxRetriesPerRequest: null }));
      },
      inject: [ConfigService],
    },
    {
      provide: DATASET_QUEUE,
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        return createQueue(DATASET_QUEUE, new IORedis(url, { maxRetriesPerRequest: null }));
      },
      inject: [ConfigService],
    },
    ProcessProcessor,
  ],
  exports: [PROCESS_QUEUE, DELAY_QUEUE, DATASET_QUEUE],
})
export class QueueModule {}
