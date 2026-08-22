/**
 * 数据集刷新处理器 — 消费 DATASET_QUEUE 任务，执行数据流 pipeline。
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { DATASET_QUEUE } from '../queue/queue.constants.js';
import { DataFlowEngine } from './dataflow-engine.service.js';
import { prisma } from '@apaas/db';
import type { DataFlowConfig } from '@apaas/shared';

@Injectable()
export class DatasetProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatasetProcessor.name);
  private worker: Worker | null = null;
  private connection: IORedis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly engine: DataFlowEngine,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      DATASET_QUEUE,
      async (job) => {
        const { datasetId, flowId, tenantId } = job.data as {
          datasetId: string;
          flowId: string;
          tenantId: string;
        };

        this.logger.log(`开始刷新数据集 ${datasetId}（数据流 ${flowId}）`);

        const flow = await prisma.dataFlow.findFirst({ where: { id: flowId, tenantId } });
        if (!flow) {
          throw new Error(`数据流 ${flowId} 不存在`);
        }

        const config = flow.config as unknown as DataFlowConfig;
        await this.engine.executeAndMaterialize(tenantId, datasetId, config);
      },
      {
        connection: this.connection.duplicate(),
        concurrency: 3,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`数据集刷新任务失败 ${job?.id}: ${err.message}`);
    });

    this.logger.log('DatasetProcessor Worker 已启动 (dataset-queue)');
  }

  async onModuleDestroy() {
    if (this.worker) await this.worker.close();
    if (this.connection) await this.connection.quit();
  }
}
