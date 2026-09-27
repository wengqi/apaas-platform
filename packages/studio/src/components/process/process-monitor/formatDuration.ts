/**
 * 从 components/process/ProcessMonitor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 */

import dayjs from 'dayjs';

/** 耗时格式化。 */
export function formatDuration(start: string, end?: string): string {
  const startMs = dayjs(start).valueOf();
  const endMs = end ? dayjs(end).valueOf() : Date.now();
  const diff = Math.max(0, endMs - startMs);
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}
