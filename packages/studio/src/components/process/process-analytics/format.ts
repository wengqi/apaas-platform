/**
 * 效率分析纯函数（从 ProcessAnalytics.tsx 拆出，便于单测）。
 */

/** 毫秒 → 可读耗时：null→'—'，<1s→'Nms'（取整——avg 聚合值为浮点，QA D-012），<1min→'N.Ns'，否则 'N.Nmin'。 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

/** 完成率（0-1 小数）→ 百分比文案：null→'—'，保留 1 位小数。 */
export function formatCompletionRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}
