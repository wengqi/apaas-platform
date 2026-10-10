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
