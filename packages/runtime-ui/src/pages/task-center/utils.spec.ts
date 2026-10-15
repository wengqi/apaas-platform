/**
 * 任务中心工具函数单测 — extractRecordTitle（「我发起的」申请摘要提取，2026-10-10）。
 */

import { describe, expect, it } from 'vitest';
import { extractRecordTitle } from './utils.js';

describe('extractRecordTitle — 申请摘要提取', () => {
  it('记录触发：优先从 inputs.title 取摘要', () => {
    expect(
      extractRecordTitle({
        inputs: { title: '测试1010', amount: 5000 },
        record: { title: '测试1010' },
        triggeredByUser: 'user-1',
      }),
    ).toBe('测试1010');
  });

  it('inputs 无 title 时回退 record.title', () => {
    expect(extractRecordTitle({ inputs: { amount: 1 }, record: { title: '备用摘要' } })).toBe(
      '备用摘要',
    );
  });

  it('手动启动（inputs 为业务变量无 title）返回 null', () => {
    expect(extractRecordTitle({ inputs: { day: 3 }, triggeredBy: 'MANUAL' })).toBeNull();
  });

  it('triggerContext 缺失/空对象返回 null', () => {
    expect(extractRecordTitle(null)).toBeNull();
    expect(extractRecordTitle(undefined)).toBeNull();
    expect(extractRecordTitle({})).toBeNull();
  });

  it('title 为空白字符串视为无摘要', () => {
    expect(extractRecordTitle({ inputs: { title: '   ' } })).toBeNull();
  });
});
