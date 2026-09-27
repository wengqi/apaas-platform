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
