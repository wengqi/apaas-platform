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
 * R1.4 多环境：
 * - repeatable job 以 `scheduled:<envKey>:<processDefId>` 为 jobId——dev/prod
 *   各自独立注册；清理带 jobId（修复旧实现仅按 pattern 清理导致同 cron 流程互踩）；
 * - 发布/回滚后 rebuildForEnvironment：先清该环境全部注册，再按 bundle 重建
 *   （bundle 模式）或按活表 PUBLISHED 流程重建（降级模式）；
 * - onRecordEvent 按记录所在环境匹配：bundle 模式匹配 bundle.processes
 *   的 triggerType；降级模式保持活表 status=PUBLISHED 匹配。
 *
 * 设计为非阻塞——触发失败仅记日志，不影响记录操作本身。
 */

import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { prisma, runWithEnv } from '@apaas/db';
import { Queue } from 'bullmq';
import type { EnvironmentKey } from '@apaas/shared';
import { ProcessEngine } from './process-engine.js';
import { EnvironmentResolverService } from '../environment/environment-resolver.service.js';
import { PROCESS_QUEUE } from '../queue/queue.constants.js';

/** 记录事件类型 → Prisma triggerType 映射。 */
const EVENT_TO_TRIGGER: Record<string, string> = {
  created: 'RECORD_CREATED',
  updated: 'RECORD_UPDATED',
  deleted: 'RECORD_DELETED',
};

/** BullMQ repeatable job 的 key 前缀，用于区分定时触发 job（含环境维度）。 */
const SCHEDULED_JOB_PREFIX = 'scheduled:';

/** 匹配流程的运行时形态（bundle 与活表行的公共子集） */
interface TriggerableProcess {
  id: string;
  apiName: string;
  name: string;
  triggerType: string | null;
  cron?: string | null;
}

@Injectable()
export class TriggerService implements OnModuleInit {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly engine: ProcessEngine,
    private readonly environmentResolver: EnvironmentResolverService,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
  ) {}

  /**
   * 模块初始化：按环境重建全部定时触发注册。
   * 有指针的应用按 bundle 注册；无指针的按活表 PUBLISHED 流程注册（prod 维度）。
   */
  async onModuleInit(): Promise<void> {
    await this.registerScheduledTriggers();
  }

  private async registerScheduledTriggers(): Promise<void> {
    try {
      const apps = await prisma.application.findMany({ select: { id: true, tenantId: true } });
      let registered = 0;
      for (const app of apps) {
        const envs = await prisma.appEnvironment.findMany({
          where: { appId: app.id, tenantId: app.tenantId, currentVersionId: { not: null } },
        });
        if (envs.length > 0) {
          for (const env of envs) {
            await this.rebuildForEnvironment(app.tenantId, app.id, env.key as EnvironmentKey);
          }
        } else {
          // 降级：无环境指针的存量应用按活表注册（prod 维度）
          const defs = await prisma.processDef.findMany({
            where: {
              appId: app.id,
              status: 'PUBLISHED',
              triggerType: 'SCHEDULED',
              cron: { not: null },
            },
            select: { id: true, apiName: true, name: true, cron: true, tenantId: true },
          });
          for (const def of defs) {
            await this.registerScheduledJob(def.tenantId, def.id, def.cron!, 'prod', def.apiName);
            registered += 1;
          }
        }
      }
      if (registered > 0) this.logger.log(`已注册 ${registered} 个定时触发流程`);
    } catch (err) {
      this.logger.error(
        `注册定时触发流程失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 按环境重建定时触发注册（发布/回滚/应用启动后调用）。
   * 先清该环境的全部注册，再按 bundle（或降级活表）注册。
   */
  async rebuildForEnvironment(
    tenantId: string,
    appId: string,
    envKey: EnvironmentKey,
  ): Promise<void> {
    try {
      const resolved = await this.environmentResolver.resolve(tenantId, appId, envKey);

      // 1) 清空该环境现有注册（该应用全部流程 × 本环境维度）
      const appProcessIds = new Set(
        (
          await prisma.processDef.findMany({
            where: { appId, tenantId },
            select: { id: true },
          })
        ).map((p) => p.id),
      );
      const repeatables = await this.processQueue.getRepeatableJobs();
      for (const job of repeatables) {
        if (!job.key?.startsWith(`${SCHEDULED_JOB_PREFIX}${envKey}:`)) continue;
        const defId = job.key.slice(`${SCHEDULED_JOB_PREFIX}${envKey}:`.length);
        if (appProcessIds.has(defId)) {
          await this.processQueue.removeRepeatableByKey(job.key);
        }
      }

      // 2) 取该环境应注册的 SCHEDULED 流程（bundle 优先，降级活表）
      let processes: TriggerableProcess[] = [];
      if (resolved.bundleMode && resolved.bundle) {
        processes = resolved.bundle.processes as TriggerableProcess[];
      } else {
        processes = await prisma.processDef.findMany({
          where: {
            appId,
            tenantId,
            status: 'PUBLISHED',
            triggerType: 'SCHEDULED',
            cron: { not: null },
          },
          select: { id: true, apiName: true, name: true, triggerType: true, cron: true },
        });
      }

      // 3) 注册（cron：bundle 缺失时回退活表——旧快照不含 cron）
      for (const proc of processes) {
        if (proc.triggerType !== 'SCHEDULED') continue;
        const cron = proc.cron ?? (await this.liveCron(proc.id));
        if (!cron) {
          this.logger.warn(`SCHEDULED 流程缺少 cron，跳过注册: ${proc.apiName}`);
          continue;
        }
        await this.registerScheduledJob(tenantId, proc.id, cron, envKey, proc.apiName);
      }
      this.logger.log(`环境触发器已重建: app=${appId} env=${envKey}`);
    } catch (err) {
      this.logger.error(
        `重建环境触发器失败 (app=${appId} env=${envKey}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 注册单个定时触发流程为 BullMQ repeatable job。
   *
   * jobId 含环境维度（`scheduled:<envKey>:<processDefId>`），dev/prod 各自独立；
   * 清理传入 { pattern, jobId } 精确匹配本 job（修复旧实现仅按 pattern 清理、
   * 同 cron 流程互踩的缺陷）。
   */
  private async registerScheduledJob(
    tenantId: string,
    processDefId: string,
    cron: string,
    envKey: EnvironmentKey,
    apiName: string,
  ): Promise<void> {
    const jobId = `${SCHEDULED_JOB_PREFIX}${envKey}:${processDefId}`;

    try {
      // 先精确移除本 job 的旧注册（pattern + jobId 组合匹配）
      await this.processQueue.removeRepeatable('scheduled-trigger', {
        pattern: cron,
        jobId,
      });

      // 注册新的 repeatable job（job data 携带 envKey，触发时直达对应环境）
      await this.processQueue.add(
        'scheduled-trigger',
        { processDefId, type: 'scheduled', envKey },
        {
          jobId,
          repeat: { pattern: cron },
        },
      );

      this.logger.log(`定时触发已注册: ${apiName} (env=${envKey} cron=${cron})`);
    } catch (err) {
      this.logger.error(
        `注册定时触发 ${apiName} 失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 流程发布后调用 — 如果是 SCHEDULED 类型，即时注册 repeatable job（活表语义，
   * prod 维度；走环境部署的应用由 rebuildForEnvironment 统一重建）。
   */
  async onProcessPublished(
    processDefId: string,
    triggerType: string | null,
    cron: string | null,
    apiName: string,
  ): Promise<void> {
    if (triggerType !== 'SCHEDULED' || !cron) return;
    const def = await prisma.processDef.findFirst({
      where: { id: processDefId },
      select: { tenantId: true },
    });
    if (!def) return;
    await this.registerScheduledJob(def.tenantId, processDefId, cron, 'prod', apiName);
  }

  /**
   * 流程下线/删除后调用 — 取消 repeatable job，防止僵尸 job 每次报错。
   */
  async onProcessUnpublished(
    processDefId: string,
    triggerType: string | null,
    cron: string | null,
    apiName: string,
  ): Promise<void> {
    if (triggerType !== 'SCHEDULED' || !cron) return;
    try {
      const def = await prisma.processDef.findFirst({
        where: { id: processDefId },
        select: { tenantId: true },
      });
      const envKeys = ['dev', 'prod'] as const;
      for (const envKey of envKeys) {
        await this.processQueue.removeRepeatable('scheduled-trigger', {
          pattern: cron,
          jobId: `${SCHEDULED_JOB_PREFIX}${envKey}:${processDefId}`,
        });
      }
      void def;
      this.logger.log(`定时触发已取消: ${apiName}`);
    } catch (err) {
      // 重复取消或 job 不存在时静默忽略
      this.logger.debug(
        `取消定时触发 ${apiName} 时: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 记录事件触发 — 查找匹配的已发布流程定义并启动（环境感知）。
   *
   * @param envKey 记录所在环境（bundle 模式只触发同环境流程；缺省 prod）
   */
  async onRecordEvent(
    tenantId: string,
    appId: string,
    objectId: string,
    eventType: 'created' | 'updated' | 'deleted',
    recordData: Record<string, unknown>,
    envKey = 'prod',
  ): Promise<void> {
    const triggerType = EVENT_TO_TRIGGER[eventType];
    if (!triggerType) return;

    try {
      // 解析环境（bundle 模式按 bundle 匹配；降级按活表 PUBLISHED 匹配）
      const resolved = await this.environmentResolver.resolve(tenantId, appId, envKey);
      let defs: Array<{ id: string; apiName: string; name: string }>;
      if (resolved.bundleMode && resolved.bundle) {
        defs = resolved.bundle.processes
          .filter((p) => p.triggerType === triggerType)
          .map((p) => ({ id: p.id, apiName: p.apiName, name: p.name }));
      } else {
        defs = await prisma.processDef.findMany({
          where: { tenantId, appId, status: 'PUBLISHED', triggerType },
          select: { id: true, apiName: true, name: true },
        });
      }

      if (defs.length === 0) return;

      // 为每个匹配的流程启动实例（环境上下文中执行——实例/节点/记录落同一环境）
      for (const def of defs) {
        const inputs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(recordData)) {
          if (v === null || v === undefined) continue;
          if (typeof v !== 'object') inputs[k] = v;
        }
        const triggerContext = {
          eventType,
          objectId,
          recordId: recordData['id'] ?? null,
          record: recordData,
          triggeredBy: triggerType,
          // 发起人（撤回权限/操作者语义依赖）：记录创建人
          triggeredByUser: recordData['created_by'] ?? null,
          inputs,
        };

        try {
          const instanceId = await runWithEnv(tenantId, envKey, () =>
            this.engine.startProcess(tenantId, def.id, triggerContext, envKey),
          );
          this.logger.log(
            `记录事件 ${eventType}(${envKey}) 触发流程 ${def.apiName}(${def.name}) → 实例 ${instanceId}`,
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
      this.logger.error(`记录事件触发异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 活表 cron 回退读取（旧快照不含 cron 时） */
  private async liveCron(processDefId: string): Promise<string | null> {
    const def = await prisma.processDef.findFirst({
      where: { id: processDefId },
      select: { cron: true },
    });
    return def?.cron ?? null;
  }
}
