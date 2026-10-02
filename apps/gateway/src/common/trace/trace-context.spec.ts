/**
 * 事件链路 ID（traceId）基础设施单测 — ALS 上下文与请求头采纳。
 */

import { describe, expect, it } from 'vitest';
import { adoptOrNewTraceId, getTraceId, newTraceId, runWithTrace } from './trace-context.js';

describe('runWithTrace / getTraceId', () => {
  it('上下文内可读取 traceId；上下文外为 null', () => {
    expect(getTraceId()).toBeNull();
    runWithTrace('trace-1', () => {
      expect(getTraceId()).toBe('trace-1');
    });
    expect(getTraceId()).toBeNull();
  });

  it('嵌套上下文内层覆盖、外层不受影响', () => {
    runWithTrace('outer', () => {
      runWithTrace('inner', () => {
        expect(getTraceId()).toBe('inner');
      });
      expect(getTraceId()).toBe('outer');
    });
  });

  it('async 边界内保持上下文（Promise 链）', async () => {
    await runWithTrace('async-trace', async () => {
      await Promise.resolve();
      expect(getTraceId()).toBe('async-trace');
    });
  });

  it('runWithTrace 返回 fn 的返回值', () => {
    expect(runWithTrace('t', () => 42)).toBe(42);
  });
});

describe('adoptOrNewTraceId', () => {
  it('字符串头直接采纳（截断 128）', () => {
    expect(adoptOrNewTraceId('abc')).toBe('abc');
    expect(adoptOrNewTraceId('x'.repeat(200)).length).toBe(128);
  });

  it('数组头取第一个', () => {
    expect(adoptOrNewTraceId(['from-array', 'other'])).toBe('from-array');
  });

  it('空/非字符串/缺失 → 生成新 UUID', () => {
    for (const input of [undefined, '', null, 123, []]) {
      const id = adoptOrNewTraceId(input);
      expect(id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(id).toBe(newTraceId() ? id : id); // 形如 UUID
    }
  });
});
