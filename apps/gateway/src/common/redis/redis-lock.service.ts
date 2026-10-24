/**
 * Redis 分布式锁（评审 P0-2）。
 *
 * 流程引擎实例级互斥此前依赖进程内 Map，多副本部署必然丢令牌。
 * 该服务基于 Redis SET NX PX + owner token + Lua 比较释放，实现跨副本互斥；
 * Redis 不可用时降级为"仅进程内互斥"并告警（不阻塞单副本开发环境）。
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const LOCK_RETRY_DELAY_MS = 50;

/** Lua 比较续期：只延长自己持有的锁（他人持有/已过期则返回 0，不误续）。 */
const RENEW_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end';

/** 简易进程内互斥（Redis 不可用时的降级 + 同进程二次防抖） */
const localLocks = new Map<string, Promise<unknown>>();

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly client: Redis | null;
  private degradedWarned = false;
  // 实例级读取（P1-07 测试可经 env 覆写；模块级常量在 import 时固化会吞掉 stub）
  private readonly lockTtlMs = Number(process.env.REDIS_LOCK_TTL_MS) || 30_000;
  private readonly maxWaitMs = Number(process.env.REDIS_LOCK_MAX_WAIT_MS) || 10_000;
  /** 看门狗续期周期 = TTL/3：任一周期续期失败仍有 ≥2 次机会在 TTL 过期前重试 */
  private readonly renewIntervalMs = Math.floor(this.lockTtlMs / 3);

  constructor() {
    const url = process.env.REDIS_URL;
    try {
      this.client = url
        ? new Redis(url, {
            lazyConnect: false,
            maxRetriesPerRequest: 2,
            // 连接失败不无限重连：交由 withLock 降级为进程内互斥
            retryStrategy: (times) => (times <= 3 ? Math.min(times * 200, 1_000) : null),
          })
        : null;
      this.client?.on('error', () => {
        if (!this.degradedWarned) {
          this.degradedWarned = true;
          this.logger.warn('Redis 连接异常，分布式锁降级为进程内互斥');
        }
      });
    } catch {
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => {});
  }

  /** 在分布式锁内执行 fn；Redis 不可用时退化为进程内互斥。 */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const token = `${process.pid}:${Math.random().toString(36).slice(2)}`;
    const lockKey = `lock:${key}`;

    if (!this.client || this.client.status !== 'ready') {
      return this.withLocalLock(key, fn);
    }

    const deadline = Date.now() + this.maxWaitMs;
    let acquired = false;
    while (Date.now() < deadline) {
      const result = await this.client.set(lockKey, token, 'PX', this.lockTtlMs, 'NX');
      if (result === 'OK') {
        acquired = true;
        break;
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
    }
    if (!acquired) {
      throw new Error(`获取分布式锁超时: ${lockKey}`);
    }

    // P1-07（对抗审查 R1-scale-07/R2-scale-02）看门狗续期：临界区（流程执行可达
    // 数十秒）超过固定 TTL 时互斥被破（实测 32s 临界区竞争者 30.0s 获锁）。
    // 持锁期间按 TTL/3 周期续期；进程存活即续，进程死亡无续期 → 锁按 TTL 自然过期。
    let watchdogActive = true;
    const renew = (): Promise<void> =>
      (this.client
        ?.eval(RENEW_SCRIPT, 1, lockKey, token, String(this.lockTtlMs))
        .catch(() => {})
        .then(() => {}) as Promise<void>) ?? Promise.resolve();
    const scheduleRenew = (): void => {
      // 锁 TTL 维护定时器，非状态同步轮询（项目禁令针对数据刷新/事件监听的轮询）；
      // 递归自调度在 finally 清零后自然终止。

      setTimeout(() => {
        if (!watchdogActive) return;
        void renew().then(() => {
          if (watchdogActive) scheduleRenew();
        });
      }, this.renewIntervalMs);
    };
    scheduleRenew();

    try {
      return await fn();
    } finally {
      watchdogActive = false;
      await this.release(lockKey, token);
    }
  }

  /** Lua 比较释放：只删除自己持有的锁，避免误删他人。 */
  private async release(lockKey: string, token: string): Promise<void> {
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await this.client?.eval(script, 1, lockKey, token).catch(() => {});
  }

  private withLocalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = localLocks.get(key) ?? Promise.resolve();
    const run = prev
      .catch(() => {
        /* 前序失败不阻断 */
      })
      .then(fn);
    localLocks.set(key, run);
    void run.finally(() => {
      if (localLocks.get(key) === run) localLocks.delete(key);
    });
    return run;
  }
}
