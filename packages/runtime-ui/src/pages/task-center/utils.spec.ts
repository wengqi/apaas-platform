/**
 * 任务中心工具函数单测 — extractRecordTitle（「我发起的」申请摘要提取，2026-10-10）。
 */

import { describe, expect, it } from 'vitest';
import { apiErrorMessage, canWithdraw, extractRecordTitle } from './utils.js';

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

describe('functional-08（R-B 批 4）', () => {
  it('canWithdraw：仅 RUNNING/WAITING_USER_TASK 可撤回，终态不可', () => {
    expect(canWithdraw('RUNNING')).toBe(true);
    expect(canWithdraw('WAITING_USER_TASK')).toBe(true);
    expect(canWithdraw('COMPLETED')).toBe(false);
    expect(canWithdraw('TERMINATED')).toBe(false);
    expect(canWithdraw('FAILED')).toBe(false);
  });

  it('apiErrorMessage：优先透出后端 error.message（403/400 语义直达）', () => {
    expect(apiErrorMessage({ response: { data: { error: { message: '仅发起人可撤回' } } } })).toBe(
      '仅发起人可撤回',
    );
    expect(apiErrorMessage(new Error('Network Error'))).toBe('Network Error');
    expect(apiErrorMessage(undefined)).toBe('请求失败');
  });
});
