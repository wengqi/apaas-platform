/**
 * AppThrottlerGuard 单测——限流维度分桶合同（R5.5 用户实测修复）。
 */

import { describe, it, expect } from 'vitest';
import { AppThrottlerGuard } from './app-throttler.guard.js';

// getTracker 为纯函数（仅读 req + crypto），绕过构造器直接取原型方法；
// protected 经子类暴露
class TestableGuard extends AppThrottlerGuard {
  track(req: Record<string, any>) {
    return this.getTracker(req);
  }
}

const guard = Object.create(TestableGuard.prototype) as TestableGuard;

describe('AppThrottlerGuard.getTracker 限流维度', () => {
  it('已解析用户 → user:<id> 桶（各用户互不挤占）', async () => {
    const tracker = await guard.track({ user: { id: 'u-001' } });
    expect(tracker).toBe('user:u-001');
  });

  it('未解析但带 Bearer 令牌 → token:<sha256 前 16 位> 桶（同令牌同桶、不依赖守卫顺序）', async () => {
    const tracker = await guard.track({
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(tracker).toMatch(/^token:[0-9a-f]{16}$/);
    const again = await guard.track({
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(again).toBe(tracker);
    const other = await guard.track({ headers: { authorization: 'Bearer xyz' } });
    expect(other).not.toBe(tracker);
  });

  it('匿名（无令牌，如登录端点）→ IP 桶（防爆破语义不变）', async () => {
    expect(await guard.track({ ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
    expect(await guard.track({ ips: ['5.6.7.8'], ip: '1.2.3.4' })).toBe('ip:5.6.7.8');
    expect(await guard.track({})).toBe('ip:unknown');
  });
});
