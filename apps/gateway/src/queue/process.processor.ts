/**
 * 流程队列消费者 — BullMQ Worker。
 *
 * 消费两个队列的 job：
 * - process-queue: { instanceId } → ProcessEngine.executeNextNode(instanceId)
 * - delay-queue:   { instanceId, nodeId } → ProcessEngine.resumeDelayedNode(instanceId, nodeId)
 *
 * Worker 使用独立 Redis 连连，与 Queue 连接分离。
 *
 * ## 租户上下文
 * BullMQ worker 在 HTTP 请求上下文之外执行，AsyncLocalStorage 为空。
 * 此处在 worker 回调内从实例/定义恢复 tenantId，通过 runWithTenant 设置 ALS，
 * 使后续 Prisma 查询自动注入 tenantId（Layer 2 防御）。
 */

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { prisma, runWithTenant } from '@apaas/db';
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
    // 流程令牌推进 Worker + 定时触发处理
    const processWorker = new Worker(
      PROCESS_QUEUE,
      async (job: Job) => {
        const data = job.data as { instanceId?: string; processDefId?: string; type?: string };

        // 定时触发 job：启动流程实例
        if (data.type === 'scheduled' && data.processDefId) {
          this.logger.debug(`消费 scheduled trigger job: processDefId=${data.processDefId}`);
          // startProcessByDefId 内部从流程定义恢复 tenantId，
          // 但需在 ALS 上下文外执行首次查询（processDefId 全局唯一，安全），
          // 然后在 startProcess 内设置 ALS。此处直接调用，引擎内部处理。
          await this.processEngine.startProcessByDefId(data.processDefId, {
            eventType: 'scheduled',
            triggeredBy: 'SCHEDULED',
          });
          return;
        }

        // 普通流程推进 job
        const { instanceId } = data;
        if (instanceId) {
          this.logger.debug(`消费 process job: instanceId=${instanceId}`);
          // 从实例恢复 tenantId（此查询在 ALS 上下文外 — 安全，instanceId 全局唯一）
          const instance = await prisma.processInstance.findFirst({
            where: { id: instanceId },
            select: { tenantId: true },
          });
          if (!instance) {
            throw new Error(`流程实例 ${instanceId} 不存在`);
          }
          // 在租户上下文中执行后续所有 DB 操作
          await runWithTenant(instance.tenantId, () =>
            this.processEngine.executeNextNode(instanceId),
          );
        }
      },
      { connection: this.connection.duplicate(), concurrency: 5 },
    );
    processWorker.on('failed', (job, err) => {
      this.logger.error(`process job 失败: ${err.message}`);
    });
    this.workers.push(processWorker);

    // 延时恢复 Worker（kind 决定恢复语义：delay=推进令牌 / wait_condition=重新求值等待条件）
    const delayWorker = new Worker(
      DELAY_QUEUE,
      async (job: Job) => {
        const { instanceId, nodeId, kind } = job.data as {
          instanceId: string;
          nodeId: string;
          kind?: string;
        };
        this.logger.debug(
          `消费 delay job: instanceId=${instanceId}, nodeId=${nodeId}, kind=${kind ?? 'delay'}`,
        );
        // 从实例恢复 tenantId（此查询在 ALS 上下文外 — 安全，instanceId 全局唯一）
        const instance = await prisma.processInstance.findFirst({
          where: { id: instanceId },
          select: { tenantId: true },
        });
        if (!instance) {
          throw new Error(`流程实例 ${instanceId} 不存在`);
        }
        // 在租户上下文中执行后续所有 DB 操作
        await runWithTenant(instance.tenantId, () =>
          kind === 'wait_condition'
            ? this.processEngine.resumeWaitCondition(instanceId, nodeId)
            : this.processEngine.resumeDelayedNode(instanceId, nodeId),
        );
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
