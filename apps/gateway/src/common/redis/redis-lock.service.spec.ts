/**
 * RedisLockService 单元测试 — P1-07 看门狗续期（对抗审查 R1-scale-07/R2-scale-02）。
 *
 * 缺陷：SET NX PX 30s 固定 TTL 无续期——临界区超 30s 时互斥被破（锁级实测
 * 32s 临界区竞争者 30.0s 获锁）。修复契约：持锁期间按 TTL/3 周期续期
 * （Lua 比较令牌只续自己的锁），临界区结束停止续期并释放。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const clientMock = {
  status: 'ready',
  set: vi.fn().mockResolvedValue('OK'),
  eval: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
};

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor() {
      return clientMock;
    }
  },
}));

import { RedisLockService } from './redis-lock.service.js';

describe('RedisLockService — P1-07 看门狗续期', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.set.mockResolvedValue('OK');
    clientMock.eval.mockResolvedValue(1);
    vi.unstubAllEnvs();
    // 构造器读 REDIS_URL 决定 client 注入；测试经 mock ioredis 返回 clientMock
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  });

  it('持锁期间按 TTL/3 周期续期（临界区超 TTL 不丢互斥）', async () => {
    vi.stubEnv('REDIS_LOCK_TTL_MS', '300'); // 续期周期 100ms
    const svc = new RedisLockService();

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let ticks = 0;
    const result = await svc.withLock('case-1', async () => {
      // 临界区 350ms > TTL 300ms：无看门狗时锁在临界区内过期
      setTimeout(() => release(), 350);
      await gate;
      ticks += 1;
      return ticks;
    });

    expect(result).toBe(1);
    // 释放调用（1 次）+ 续期调用（≥2 次：100ms/200ms/300ms 周期）
    const evalCalls = clientMock.eval.mock.calls.map((c) => String(c[0]));
    const renewCalls = evalCalls.filter((s) => s.includes('pexpire')).length;
    expect(renewCalls).toBeGreaterThanOrEqual(2);
  });

  it('临界区结束后停止续期并按持有者令牌释放', async () => {
    vi.stubEnv('REDIS_LOCK_TTL_MS', '300');
    const svc = new RedisLockService();

    await svc.withLock('case-2', async () => 'done');

    const evalCalls = clientMock.eval.mock.calls.map((c) => String(c[0]));
    const delCalls = evalCalls.filter((s) => s.includes('"del"')).length;
    expect(delCalls).toBe(1); // 仅释放，无持续续期
    // 等一个续期周期确认无后续续期
    await new Promise((r) => setTimeout(r, 250));
    const delAfter = clientMock.eval.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('"del"')).length;
    expect(delAfter).toBe(1);
  });

  it('SET NX 失败超时 → 抛获取锁超时（既有语义）', async () => {
    vi.stubEnv('REDIS_LOCK_TTL_MS', '300');
    vi.stubEnv('REDIS_LOCK_MAX_WAIT_MS', '150');
    clientMock.set.mockResolvedValue(null); // 恒被占用
    const svc = new RedisLockService();

    await expect(svc.withLock('case-3', async () => 1)).rejects.toThrow('获取分布式锁超时');
  });
});
