/**
 * 触发器服务 — 监听记录事件 + 定时触发，自动启动匹配的已发布流程。
 *
 * 触发语义（I-1 修缮，2026-10-17）：触发信息以流程自身 workflowSchema 的
 * trigger 节点为 SSOT（画布「触发器」节点的 data.triggerType/objectId/cron，
 * TriggerConfigForm 直写扁平形状）；schema 无 trigger 节点时回退顶层
 * ProcessDef.triggerType/cron 列（种子/AI 建流契约）。
 *
 * I-1 修前两个子问题：①匹配按顶层列，画布只写 schema 不同步顶层列 → 记录
 * 事件永不命中；②可见集 = 应用 bundle 快照，晚于应用发布的流程须重发应用才
 * 入 bundle。修后匹配集统一为**活表 PUBLISHED**（流程级发布语义，发布即生效，
 * bundle 不再约束自动触发——与搭建期活表语义归一）。触发节点绑定 objectId 时
 * 按对象精确匹配（修前应用级全对象误触发），缺省保持应用级。实例仍按事件所在
 * 环境隔离（runWithEnv），执行 schema 以活表 PUBLISHED 为准（schemaOverride
 * 直通，bundle 陈旧快照不影响自动触发实例）。
 *
 * SCHEDULED 定时触发：BullMQ repeatable job，jobId=`scheduled:<envKey>:<defId>`
 * 随环境隔离；注册集同上（活表 PUBLISHED + 触发节点 cron 回退顶层列）。
 * MANUAL 启动走 ProcessController.startInstance，不经本服务。
 *
 * 设计为非阻塞——触发失败仅记日志，不影响记录操作本身。
 */

import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { prisma, runWithEnv } from '@apaas/db';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { EnvironmentKey } from '@apaas/shared';
import { ProcessEngine } from './process-engine.js';
import { RedisLockService } from '../common/redis/redis-lock.service.js';
import { PROCESS_QUEUE } from '../queue/queue.constants.js';

/** 记录事件类型 → 触发类型映射（与 TriggerType 枚举值对齐）。 */
const EVENT_TO_TRIGGER: Record<string, string> = {
  created: 'RECORD_CREATED',
  updated: 'RECORD_UPDATED',
  deleted: 'RECORD_DELETED',
};

/** BullMQ repeatable job 的 key 前缀，用于区分定时触发 job（含环境维度）。 */
const SCHEDULED_JOB_PREFIX = 'scheduled:';
/** P1-04 注册账本（Redis hash）：定时注册的 repeatJobKey 反查表 */
const TRIGGER_REGISTRY_KEY = 'apaas:trigger-registry';

/** 从流程定义提取出的触发信息（schema 触发节点为 SSOT，顶层列为回退）。 */
interface TriggerInfo {
  triggerType: string | null;
  /** 触发绑定的对象 ID（undefined = 应用级匹配，存量语义） */
  objectId?: string;
  cron: string | null;
}

/**
 * 从 workflowSchema 的 trigger 节点提取触发信息（I-1）。
 *
 * 节点 data 为画布扁平形状 { triggerType, objectId, event, cron, startPageId }
 * （TriggerConfigForm 直写；shared TriggerConfig 的嵌套 objectTrigger 形状
 * 无实际写入方，不消费）。节点缺字段 / schema 无 trigger 节点 / schema 非法时
 * 回退顶层列 fallback——种子与 AI 建流（指南最小骨架无 trigger 节点）依赖此回退。
 */
export function extractTriggerInfo(
  schema: unknown,
  fallback: { triggerType: string | null; cron: string | null },
): TriggerInfo {
  const nodes = (schema as { nodes?: unknown } | null)?.nodes;
  if (Array.isArray(nodes)) {
    const triggerNode = nodes.find((n) => (n as { type?: unknown } | null)?.type === 'trigger') as
      { data?: Record<string, unknown> } | undefined;
    const data = triggerNode?.data;
    if (data) {
      return {
        triggerType:
          typeof data['triggerType'] === 'string' && data['triggerType']
            ? data['triggerType']
            : fallback.triggerType,
        objectId:
          typeof data['objectId'] === 'string' && data['objectId'] ? data['objectId'] : undefined,
        cron: typeof data['cron'] === 'string' && data['cron'] ? data['cron'] : fallback.cron,
      };
    }
  }
  return { triggerType: fallback.triggerType, objectId: undefined, cron: fallback.cron };
}

@Injectable()
export class TriggerService implements OnModuleInit {
  private readonly logger = new Logger(TriggerService.name);

  /**
   * P1-04 注册账本：field=`<envKey>:<processDefId>` → value=BullMQ repeatJobKey
   * （BullMQ 5.81 repeatable key 为纯 md5 哈希，无法从 getRepeatableJobs 反查）。
   * registryClient 可注入（测试）；未注入且配置 REDIS_URL 时自建惰性客户端——
   * Redis 不可用时清理降级为告警（单副本开发可接受，多副本部署必配 Redis）。
   */
  private registry: Redis | null;

  constructor(
    private readonly engine: ProcessEngine,
    @Inject(PROCESS_QUEUE) private readonly processQueue: Queue,
    @Optional() private readonly redisLock?: RedisLockService,
    @Optional() registryClient?: Redis | null,
  ) {
    this.registry =
      registryClient !== undefined
        ? registryClient
        : process.env.REDIS_URL
          ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }).on(
              'error',
              () => {},
            )
          : null;
  }

  /**
   * 模块初始化：按环境重建全部定时触发注册。
   * 有环境指针的应用逐环境重建；无指针的应用按活表 PUBLISHED 注册（prod 维度）。
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
          // 不按顶层列预过滤——画布配置的定时触发只写在 schema 触发节点（I-1）
          const defs = await prisma.processDef.findMany({
            where: { appId: app.id, status: 'PUBLISHED' },
            select: {
              id: true,
              apiName: true,
              name: true,
              triggerType: true,
              cron: true,
              tenantId: true,
              workflowSchema: true,
            },
          });
          for (const def of defs) {
            const info = extractTriggerInfo(def.workflowSchema, {
              triggerType: def.triggerType,
              cron: def.cron,
            });
            if (info.triggerType !== 'SCHEDULED' || !info.cron) continue;
            await this.registerScheduledJob(def.tenantId, def.id, info.cron, 'prod', def.apiName);
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
   * 按环境重建定时触发注册（应用启动/部署/回滚后调用）。
   * 先清该环境的全部注册，再按活表 PUBLISHED + 触发节点重建（I-1：bundle
   * 不再约束定时注册——晚于应用发布/流程级发布的定时流程同样生效）。
   */
  async rebuildForEnvironment(
    tenantId: string,
    appId: string,
    envKey: EnvironmentKey,
  ): Promise<void> {
    try {
      // 1) 清空该环境现有注册（该应用全部流程 × 本环境维度）。
      // P1-04：按注册账本反查——BullMQ 5.81 getRepeatableJobs 的 key 是纯 md5
      // 哈希（无 jobId 可读段），旧实现按 'scheduled:' 前缀过滤永假=死代码，
      // 串行换 cron 时旧注册永不被清 → 双 cron 并存。
      const appProcessIds = new Set(
        (
          await prisma.processDef.findMany({
            where: { appId, tenantId },
            select: { id: true },
          })
        ).map((p) => p.id),
      );
      if (this.registry) {
        await this.registry.connect().catch(() => {});
        const registryMap = await this.registry.hgetall(TRIGGER_REGISTRY_KEY).catch(() => ({}));
        const envPrefix = `${envKey}:`;
        for (const [field, repeatJobKey] of Object.entries(registryMap)) {
          if (!field.startsWith(envPrefix)) continue;
          const defId = field.slice(envPrefix.length);
          if (!appProcessIds.has(defId)) continue;
          await this.processQueue.removeRepeatableByKey(repeatJobKey).catch(() => {});
          await this.registry.hdel(TRIGGER_REGISTRY_KEY, field).catch(() => {});
        }
      } else {
        this.logger.warn('Redis 账本不可用，定时注册清理跳过（多副本部署需配置 REDIS_URL）');
      }

      // 2) 注册集 = 活表 PUBLISHED（流程级发布语义，与记录触发同语义源）
      const processes = await prisma.processDef.findMany({
        where: { appId, tenantId, status: 'PUBLISHED' },
        select: {
          id: true,
          apiName: true,
          name: true,
          triggerType: true,
          cron: true,
          workflowSchema: true,
        },
      });

      // 3) 注册（cron：触发节点为 SSOT，缺省回退活表列）
      for (const proc of processes) {
        const info = extractTriggerInfo(proc.workflowSchema, {
          triggerType: proc.triggerType,
          cron: proc.cron,
        });
        if (info.triggerType !== 'SCHEDULED') continue;
        if (!info.cron) {
          this.logger.warn(`SCHEDULED 流程缺少 cron，跳过注册: ${proc.apiName}`);
          continue;
        }
        await this.registerScheduledJob(tenantId, proc.id, info.cron, envKey, proc.apiName);
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

    // P1-04：注册按环境串行化——removeRepeatable 与 add 之间窗口内并发注册
    // 同一流程会双 cron 并存（串行换 cron 即双注册竞态，实测 49/50 吞注册）
    const register = async (): Promise<void> => {
      try {
        // 先精确移除本 job 的旧注册（pattern + jobId 组合匹配）
        await this.processQueue.removeRepeatable('scheduled-trigger', {
          pattern: cron,
          jobId,
        });

        // 注册新的 repeatable job（job data 携带 envKey，触发时直达对应环境）
        const job = await this.processQueue.add(
          'scheduled-trigger',
          { processDefId, type: 'scheduled', envKey },
          {
            jobId,
            repeat: { pattern: cron },
          },
        );

        // 登记账本：BullMQ 5.81 的 repeatable key 是纯 md5 哈希（实测
        // '746fbc82...'，无 jobId 可读段），removeRepeatableByKey 需要——
        // 不登记则清理阶段无法定位旧注册（死代码根源）
        const repeatJobKey = (job as { repeatJobKey?: string } | undefined)?.repeatJobKey;
        if (repeatJobKey && this.registry) {
          await this.registry
            .hset(TRIGGER_REGISTRY_KEY, `${envKey}:${processDefId}`, repeatJobKey)
            .catch(() => {});
        }

        this.logger.log(`定时触发已注册: ${apiName} (env=${envKey} cron=${cron})`);
      } catch (err) {
        this.logger.error(
          `注册定时触发 ${apiName} 失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    if (this.redisLock) {
      await this.redisLock.withLock(`trigger-register:${envKey}`, register);
    } else {
      await register();
    }
  }

  /**
   * 流程发布后调用 — SCHEDULED 类型即时注册 repeatable job（prod 维度；
   * dev 维度与其他环境随下次 rebuildForEnvironment 收敛）。
   * @param workflowSchema 流程 schema（I-1：触发信息以触发节点为 SSOT）
   */
  async onProcessPublished(
    processDefId: string,
    triggerType: string | null,
    cron: string | null,
    apiName: string,
    workflowSchema?: unknown,
  ): Promise<void> {
    const info = extractTriggerInfo(workflowSchema ?? null, {
      triggerType,
      cron,
    });
    if (info.triggerType !== 'SCHEDULED' || !info.cron) return;
    const def = await prisma.processDef.findFirst({
      where: { id: processDefId },
      select: { tenantId: true },
    });
    if (!def) return;
    await this.registerScheduledJob(def.tenantId, processDefId, info.cron, 'prod', apiName);
  }

  /**
   * 流程下线/删除后调用 — 取消 repeatable job，防止僵尸 job 每次报错。
   * @param workflowSchema 流程 schema（与注册时同语义源提取 cron，保证能精确取消）
   */
  async onProcessUnpublished(
    processDefId: string,
    triggerType: string | null,
    cron: string | null,
    apiName: string,
    workflowSchema?: unknown,
  ): Promise<void> {
    const info = extractTriggerInfo(workflowSchema ?? null, {
      triggerType,
      cron,
    });
    if (info.triggerType !== 'SCHEDULED' || !info.cron) return;
    try {
      const envKeys = ['dev', 'prod'] as const;
      for (const envKey of envKeys) {
        await this.processQueue.removeRepeatable('scheduled-trigger', {
          pattern: info.cron,
          jobId: `${SCHEDULED_JOB_PREFIX}${envKey}:${processDefId}`,
        });
      }
      this.logger.log(`定时触发已取消: ${apiName}`);
    } catch (err) {
      // 重复取消或 job 不存在时静默忽略
      this.logger.debug(
        `取消定时触发 ${apiName} 时: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 记录事件触发 — 按活表 PUBLISHED 流程的触发节点匹配并启动（环境感知）。
   *
   * I-1：触发信息以 schema 触发节点为 SSOT（回退顶层列）；匹配集 = 活表
   * PUBLISHED（流程级发布语义，bundle 不再约束）；触发节点绑定 objectId 时
   * 按对象精确匹配。实例以活表 schema 执行（schemaOverride 直通）。
   *
   * @param envKey 记录所在环境（实例/节点/记录落同一环境；缺省 prod）
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
      const defs = await prisma.processDef.findMany({
        where: { tenantId, appId, status: 'PUBLISHED' },
        select: {
          id: true,
          apiName: true,
          name: true,
          triggerType: true,
          workflowSchema: true,
        },
      });

      const matched = defs.filter((def) => {
        const info = extractTriggerInfo(def.workflowSchema, {
          triggerType: def.triggerType,
          cron: null,
        });
        if (info.triggerType !== triggerType) return false;
        // 触发节点绑定对象时按对象精确匹配；缺省应用级（存量语义）
        return info.objectId === undefined || info.objectId === objectId;
      });
      if (matched.length === 0) return;

      // 为每个匹配的流程启动实例（环境上下文中执行——实例/节点/记录落同一环境）
      for (const def of matched) {
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
            // schemaOverride：以活表 PUBLISHED schema 执行（发布即生效，
            // bundle 陈旧快照不约束自动触发实例）
            this.engine.startProcess(
              tenantId,
              def.id,
              triggerContext,
              envKey,
              def.workflowSchema as Record<string, unknown>,
            ),
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
}
