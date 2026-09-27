/**
 * 任务中心 — 状态常量（从 TaskCenter.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

export const STATUS_COLORS: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  DELEGATED: 'blue',
  CANCELLED: 'default',
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  DELEGATED: '已转办',
  CANCELLED: '已取消',
};
