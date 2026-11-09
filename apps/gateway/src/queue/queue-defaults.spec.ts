/**
 * PE-11 队列缺省选项常量单测——delayQueue 依赖队列级 defaultJobOptions 获得重试
 * 与清理语义（BullMQ 入队时刻固化，队列工厂为唯一注入点）。
 */
import { describe, expect, it } from 'vitest';
import { QUEUE_DEFAULT_JOB_OPTS } from './queue-defaults.js';

describe('QUEUE_DEFAULT_JOB_OPTS（PE-11）', () => {
  it('含重试/退避/完成清理/失败清理四要素', () => {
    expect(QUEUE_DEFAULT_JOB_OPTS.attempts).toBeGreaterThanOrEqual(3);
    expect(QUEUE_DEFAULT_JOB_OPTS.backoff.type).toBe('exponential');
    expect(QUEUE_DEFAULT_JOB_OPTS.removeOnComplete).toBeDefined();
    expect(QUEUE_DEFAULT_JOB_OPTS.removeOnFail).toBeDefined();
  });
});
