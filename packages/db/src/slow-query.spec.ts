/**
 * 慢查询观测 hook 单测（db 包）— 注册/通知/取消注册 + 阈值解析。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onSlowQuery,
  notifySlowQuery,
  resolveSlowQueryThresholdMs,
  SLOW_QUERY_DEFAULT_THRESHOLD_MS,
} from './slow-query.js';

afterEach(() => {
  delete process.env.SLOW_QUERY_THRESHOLD_MS;
});

describe('onSlowQuery / notifySlowQuery', () => {
  it('注册的 handler 收到慢查询信息', () => {
    const handler = vi.fn();
    const unsubscribe = onSlowQuery(handler);
    try {
      notifySlowQuery({ model: 'Record', operation: 'findMany', durationMs: 1500 });
      expect(handler).toHaveBeenCalledWith({
        model: 'Record',
        operation: 'findMany',
        durationMs: 1500,
      });
    } finally {
      unsubscribe();
    }
  });

  it('取消注册后不再收到通知', () => {
    const handler = vi.fn();
    const unsubscribe = onSlowQuery(handler);
    unsubscribe();
    notifySlowQuery({ model: 'Record', operation: 'count', durationMs: 2000 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('单个 handler 抛异常不影响其他 handler（观测不反噬查询）', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const unsub1 = onSlowQuery(bad);
    const unsub2 = onSlowQuery(good);
    try {
      expect(() =>
        notifySlowQuery({ model: 'User', operation: 'findUnique', durationMs: 99 }),
      ).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    } finally {
      unsub1();
      unsub2();
    }
  });
});

describe('resolveSlowQueryThresholdMs', () => {
  it('未设置时回退默认值', () => {
    expect(resolveSlowQueryThresholdMs()).toBe(SLOW_QUERY_DEFAULT_THRESHOLD_MS);
  });

  it('合法正数生效', () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = '250';
    expect(resolveSlowQueryThresholdMs()).toBe(250);
  });

  it('非法值（0/负数/NaN/空串）回退默认值', () => {
    for (const bad of ['0', '-5', 'abc', '']) {
      process.env.SLOW_QUERY_THRESHOLD_MS = bad;
      expect(resolveSlowQueryThresholdMs()).toBe(SLOW_QUERY_DEFAULT_THRESHOLD_MS);
    }
  });
});
