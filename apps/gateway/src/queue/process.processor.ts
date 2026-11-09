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
 *
 * ## 失败语义（PE-13）
 * 引擎不再先行置实例 FAILED：瞬时失败上抛交 BullMQ attempts 重试（重试再入从
 * 失败节点重投）；NonRetryableNodeError 同步落实例 FAILED（R2-scale-01）；
 * 瞬时失败重试耗尽（attemptsMade+1 >= attempts）后落实例 FAILED——
 * 见 process worker handler 内分类逻辑与 ProcessEngine.finalizeFailedInstance。
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
import { NonRetryableNodeError } from '../process/types.js';

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
        const data = job.data as {
          instanceId?: string;
          processDefId?: string;
          type?: string;
          envKey?: string;
        };

        // 定时触发 job：启动流程实例
        if (data.type === 'scheduled' && data.processDefId) {
          this.logger.debug(`消费 scheduled trigger job: processDefId=${data.processDefId}`);
          // startProcessByDefId 内部从流程定义恢复 tenantId，
          // 但需在 ALS 上下文外执行首次查询（processDefId 全局唯一，安全），
          // 然后在 startProcess 内设置 ALS。此处直接调用，引擎内部处理。
          await this.processEngine.startProcessByDefId(
            data.processDefId,
            {
              eventType: 'scheduled',
              triggeredBy: 'SCHEDULED',
            },
            // R1.4：job data 携带环境 key，定时触发直达对应环境
            typeof data.envKey === 'string' ? data.envKey : 'prod',
          );
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
          await runWithTenant(instance.tenantId, async () => {
            try {
              await this.processEngine.executeNextNode(instanceId);
            } catch (err) {
              // ✅3 retryable 分类（Temporal 借鉴 §8.1；PE-13 R-B 波次④⑤）：
              // 引擎已不先行置实例 FAILED——瞬时失败交 BullMQ attempts 重试
              // （重试再入从失败节点重投），异常在此分类处置：
              // ① NonRetryableNodeError（配置/校验类确定性失败）：重试不会成功，
              //   同步落实例 FAILED（R2-scale-01——引擎先行置 FAILED 的旧前提已摘除，
              //   不同步落库则 9 处抛出点从 FAILED 留痕变永久 RUNNING 搁浅），吞掉
              //   异常避免 BullMQ attempts:3 空转；
              // ② 瞬时失败：上抛交重试；最终尝试先落实例 FAILED 再上抛——判定点
              //   attemptsMade+1 >= attempts 与 BullMQ shouldRetryJob 的
              //   attemptsMade+1 < opts.attempts 精确镜像（BullMQ 5.81.3 于
              //   moveToFailed 内才自增 attemptsMade，handler 运行期为既往尝试数）。
              if (err instanceof NonRetryableNodeError) {
                this.logger.warn(
                  `process job 确定性失败（不重试）: instanceId=${instanceId}, ${err.message}`,
                );
                await this.finalizeSafely(instanceId, err.message);
                return;
              }
              const attempts = job.opts?.attempts ?? 1;
              if (job.attemptsMade + 1 >= attempts) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.error(
                  `process job 瞬时失败重试耗尽（attempts=${attempts}）: instanceId=${instanceId}, ${msg}`,
                );
                await this.finalizeSafely(instanceId, msg);
              }
              throw err;
            }
          });
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
        const { instanceId, nodeId, kind, nodeExecutionId, subInstanceId, subStatus, error } =
          job.data as {
            instanceId: string;
            nodeId: string;
            kind?: string;
            nodeExecutionId?: string;
            subInstanceId?: string;
            subStatus?: 'COMPLETED' | 'FAILED';
            error?: string;
          };
        this.logger.debug(
          `消费 delay job: instanceId=${instanceId}, nodeId=${nodeId}, kind=${kind ?? 'delay'}`,
        );
        // S1 任务超时：从任务行恢复 tenantId（批次维度处理，无 instanceId 前置查询）
        if (kind === 'task_timeout') {
          if (!nodeExecutionId) throw new Error('task_timeout job 缺少 nodeExecutionId');
          const anyTask = await prisma.processTask.findFirst({
            where: { nodeExecutionId },
            select: { tenantId: true },
          });
          if (!anyTask) return; // 批次任务已不存在（实例被删），幂等返回
          await runWithTenant(anyTask.tenantId, () =>
            this.processEngine.handleTaskTimeout(instanceId, nodeId, nodeExecutionId),
          );
          return;
        }
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
          kind === 'resume_parent'
            ? this.processEngine.resumeParentAfterSubProcess(
                instanceId,
                nodeId,
                subInstanceId!,
                subStatus ?? 'COMPLETED',
                error,
              )
            : kind === 'wait_condition'
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

  /**
   * final-failure 落库兜底（PE-13）：finalize 自身失败（Redis/DB 抖动）不掩盖
   * 原始异常、不影响重试语义——残余的 RUNNING 孤儿由后续 sweeper（PE-12 工单）
   * 巡检兜底，此处显式留痕。
   */
  private async finalizeSafely(instanceId: string, errorMsg: string): Promise<void> {
    try {
      await this.processEngine.finalizeFailedInstance(instanceId, errorMsg);
    } catch (finalizeErr) {
      this.logger.error(
        `final-failure 落库失败（实例可能停留 RUNNING，待 sweeper 兜底）: instanceId=${instanceId}, ${
          finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr)
        }`,
      );
    }
  }
}
