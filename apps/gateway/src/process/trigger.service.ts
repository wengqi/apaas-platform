/**
 * 触发器服务 — 监听记录事件 + 定时触发，自动启动匹配的已发布流程。
 *
 * 触发类型（对齐 Prisma ProcessDef.triggerType）：
 * - RECORD_CREATED: 记录创建后触发
 * - RECORD_UPDATED: 记录更新后触发
 * - RECORD_DELETED: 记录删除后触发
 * - SCHEDULED: 定时触发（BullMQ repeatable job，按 cron 表达式调度）
 * - MANUAL: 手动触发（ProcessController.startInstance，不走此服务）
 *
 * 调用方：
 * - RecordService 在 create/update/delete 后调用 onRecordEvent()。
 * - onModuleInit() 启动时扫描 SCHEDULED 流程并注册 BullMQ repeatable job。
 *
 * 设计为非阻塞——触发失败仅记日志，不影响记录操作本身。
 */

import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { Queue } from 'bullmq';
import { ProcessEngine } from './process-engine.js';
import { PROCESS_QUEUE } from '../queue/queue.constants.js';

/** 记录事件类型 → Prisma triggerType 映射。 */
const EVENT_TO_TRIGGER: Record<string, string> = {
  created: 'RECORD_CREATED',
  updated: 'RECORD_UPDATED',
  deleted: 'RECORD_DELETED',
};

/** BullMQ repeatable job 的 key 前缀，用于区分定时触发 job。 */
const SCHEDULED_JOB_PREFIX = 'scheduled:';

@Injectable()
export class TriggerService implements OnModuleInit {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly engine: ProcessEngine,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
  ) {}

  /**
   * 模块初始化时扫描所有 SCHEDULED 类型的已发布流程，注册 BullMQ repeatable job。
   */
  async onModuleInit(): Promise<void> {
    await this.registerScheduledTriggers();
  }

  /**
   * 扫描并注册所有定时触发流程。
   * 在应用启动时调用，将 SCHEDULED 流程注册为 BullMQ repeatable job。
   */
  private async registerScheduledTriggers(): Promise<void> {
    try {
      const scheduledDefs = await prisma.processDef.findMany({
        where: {
          status: 'PUBLISHED',
          triggerType: 'SCHEDULED',
          cron: { not: null },
        },
        select: { id: true, apiName: true, name: true, cron: true, tenantId: true, appId: true },
      });

      if (scheduledDefs.length === 0) {
        this.logger.debug('无定时触发流程需要注册');
        return;
      }

      for (const def of scheduledDefs) {
        await this.registerScheduledJob(def.id, def.cron!, def.apiName);
      }

      this.logger.log(`已注册 ${scheduledDefs.length} 个定时触发流程`);
    } catch (err) {
      this.logger.error(
        `注册定时触发流程失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 注册单个定时触发流程为 BullMQ repeatable job。
   */
  private async registerScheduledJob(
    processDefId: string,
    cron: string,
    apiName: string,
  ): Promise<void> {
    const jobId = `${SCHEDULED_JOB_PREFIX}${processDefId}`;

    try {
      // 先移除旧的 repeatable job（避免重复注册）
      await this.processQueue.removeRepeatableByKey(jobId);

      // 注册新的 repeatable job
      await this.processQueue.add(
        'scheduled-trigger',
        { processDefId, type: 'scheduled' },
        {
          jobId,
          repeat: { pattern: cron },
        },
      );

      this.logger.log(`定时触发已注册: ${apiName} (cron=${cron})`);
    } catch (err) {
      this.logger.error(
        `注册定时触发 ${apiName} 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 记录事件触发 — 查找匹配的已发布流程定义并启动。
   *
   * @param tenantId 租户 ID
   * @param appId 应用 ID
   * @param objectId 对象 ID
   * @param eventType 事件类型（created/updated/deleted）
   * @param recordData 记录数据（传入触发上下文供流程节点引用）
   */
  async onRecordEvent(
    tenantId: string,
    appId: string,
    objectId: string,
    eventType: 'created' | 'updated' | 'deleted',
    recordData: Record<string, unknown>,
  ): Promise<void> {
    const triggerType = EVENT_TO_TRIGGER[eventType];
    if (!triggerType) return;

    try {
      // 查找匹配的已发布流程定义
      const defs = await prisma.processDef.findMany({
        where: {
          tenantId,
          appId,
          status: 'PUBLISHED',
          triggerType,
        },
        select: { id: true, apiName: true, name: true },
      });

      if (defs.length === 0) return;

      // 为每个匹配的流程启动实例
      for (const def of defs) {
        const triggerContext = {
          eventType,
          objectId,
          recordId: recordData['id'] ?? null,
          record: recordData,
          triggeredBy: 'record_event',
        };

        try {
          const instanceId = await this.engine.startProcess(
            tenantId,
            def.id,
            triggerContext,
          );
          this.logger.log(
            `记录事件 ${eventType} 触发流程 ${def.apiName}(${def.name}) → 实例 ${instanceId}`,
          );
        } catch (err) {
          // 单个流程启动失败不影响其他流程
          this.logger.error(
            `流程 ${def.apiName} 启动失败: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      // 触发器整体失败不影响记录操作
      this.logger.error(
        `记录事件触发异常: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
