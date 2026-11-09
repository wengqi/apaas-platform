/**
 * 任务中心 — 列表数据归一化（从 TaskCenter.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import type { ProcessTask } from '../../api/tasks.js';

/** API 返回 data 为数组（非分页对象），统一转为 items 数组。 */
export function normalizeItems(data: unknown): ProcessTask[] {
  if (Array.isArray(data)) return data as ProcessTask[];
  if (data && typeof data === 'object' && 'items' in data)
    return (data as { items: ProcessTask[] }).items;
  return [];
}

/**
 * 从实例 triggerContext 提取申请摘要（记录 title 字段）。
 * 记录触发时 inputs / record 为扁平记录字段（title 优先取 inputs）；
 * 无 title（如手动启动仅传业务变量）时返回 null，由调用方显示「—」。
 */
export function extractRecordTitle(triggerContext?: Record<string, unknown> | null): string | null {
  const sources = [triggerContext?.['inputs'], triggerContext?.['record']];
  for (const source of sources) {
    const title =
      source && typeof source === 'object'
        ? (source as Record<string, unknown>)['title']
        : undefined;
    if (typeof title === 'string' && title.trim()) return title;
  }
  return null;
}

/** functional-08：可撤回状态（仅进行中的实例可撤回，终态行不显示撤回入口）。 */
export function canWithdraw(status: string): boolean {
  return status === 'RUNNING' || status === 'WAITING_USER_TASK';
}

/** functional-08：从 API 错误中提取后端语义消息（403/400 直接透出，不吞成通用文案）。 */
export function apiErrorMessage(err: unknown): string {
  const e = (err ?? {}) as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return e.response?.data?.error?.message ?? e.message ?? '请求失败';
}
