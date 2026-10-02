/**
 * 效率分析纯函数单测（formatDuration / formatCompletionRate）。
 */

import { describe, it, expect } from 'vitest';
import { formatDuration, formatCompletionRate } from './format.js';

describe('formatDuration', () => {
  it('null 显示 —', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it('小于 1s 显示毫秒', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('小于 1min 显示秒（1 位小数）', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(12_340)).toBe('12.3s');
    expect(formatDuration(59_999)).toBe('60.0s');
  });

  it('1min 及以上显示分钟（1 位小数）', () => {
    expect(formatDuration(60_000)).toBe('1.0min');
    expect(formatDuration(90_500)).toBe('1.5min');
    expect(formatDuration(3_600_000)).toBe('60.0min');
  });
});

describe('formatCompletionRate', () => {
  it('null 显示 —', () => {
    expect(formatCompletionRate(null)).toBe('—');
  });

  it('小数转百分比（1 位小数）', () => {
    expect(formatCompletionRate(0)).toBe('0.0%');
    expect(formatCompletionRate(0.9543)).toBe('95.4%');
    expect(formatCompletionRate(1)).toBe('100.0%');
  });
});
