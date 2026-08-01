/**
 * 流程队列消费者 — BullMQ Worker。
 *
 * 消费两个队列的 job：
 * - process-queue: { instanceId } → ProcessEngine.executeNextNode(instanceId)
 * - delay-queue:   { instanceId, nodeId } → ProcessEngine.resumeDelayedNode(instanceId, nodeId)
 *
 * Worker 使用独立 Redis 连连，与 Queue 连接分离。
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PROCESS_QUEUE, DELAY_QUEUE } from './queue.constants.js';
import { ProcessEngine } from '../process/process-engine.js';

@Injectable()
export class ProcessProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessProcessor.name);
  private workers: Worker[] = [];
  private connection: IORedis;

  constructor(
    @Inject(forwardRef(() => ProcessEngine))
    private readonly processEngine: ProcessEngine,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
  }

  onModuleInit() {
    // 流程令牌推进 Worker
    const processWorker = new Worker(
      PROCESS_QUEUE,
      async (job: Job) => {
        const { instanceId } = job.data as { instanceId: string };
        this.logger.debug(`消费 process job: instanceId=${instanceId}`);
        await this.processEngine.executeNextNode(instanceId);
      },
      { connection: this.connection.duplicate(), concurrency: 5 },
    );
    processWorker.on('failed', (job, err) => {
      this.logger.error(`process job 失败 (instanceId=${job?.data?.instanceId}): ${err.message}`);
    });
    this.workers.push(processWorker);

    // 延时恢复 Worker
    const delayWorker = new Worker(
      DELAY_QUEUE,
      async (job: Job) => {
        const { instanceId, nodeId } = job.data as { instanceId: string; nodeId: string };
        this.logger.debug(`消费 delay job: instanceId=${instanceId}, nodeId=${nodeId}`);
        await this.processEngine.resumeDelayedNode(instanceId, nodeId);
      },
      { connection: this.connection.duplicate(), concurrency: 5 },
    );
    delayWorker.on('failed', (job, err) => {
      this.logger.error(`delay job 失败: ${err.message}`);
    });
    this.workers.push(delayWorker);

    this.logger.log('BullMQ Workers 已启动 (process-queue + delay-queue)');
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.connection.quit();
    this.logger.log('BullMQ Workers 已关闭');
  }
}
