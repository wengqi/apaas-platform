/**
 * Redis 分布式锁（评审 P0-2）。
 *
 * 流程引擎实例级互斥此前依赖进程内 Map，多副本部署必然丢令牌。
 * 该服务基于 Redis SET NX PX + owner token + Lua 比较释放，实现跨副本互斥；
 * Redis 不可用时降级为"仅进程内互斥"并告警（不阻塞单副本开发环境）。
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const LOCK_TTL_MS = 30_000;
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_MAX_WAIT_MS = 10_000;

/** 简易进程内互斥（Redis 不可用时的降级 + 同进程二次防抖） */
const localLocks = new Map<string, Promise<unknown>>();

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly client: Redis | null;
  private degradedWarned = false;

  constructor() {
    const url = process.env.REDIS_URL;
    try {
      this.client = url ? new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 }) : null;
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

    const deadline = Date.now() + LOCK_MAX_WAIT_MS;
    let acquired = false;
    while (Date.now() < deadline) {
      const result = await this.client.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX');
      if (result === 'OK') {
        acquired = true;
        break;
      }
      await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
    }
    if (!acquired) {
      throw new Error(`获取分布式锁超时: ${lockKey}`);
    }

    try {
      return await fn();
    } finally {
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
