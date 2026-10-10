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

/** 流程实例状态（「我发起的」视图，对齐 Prisma ProcessInstanceStatus）。 */
export const INSTANCE_STATUS_COLORS: Record<string, string> = {
  RUNNING: 'blue',
  WAITING_USER_TASK: 'orange',
  COMPLETED: 'green',
  FAILED: 'red',
  TERMINATED: 'default',
};

export const INSTANCE_STATUS_LABELS: Record<string, string> = {
  RUNNING: '运行中',
  WAITING_USER_TASK: '审批中',
  COMPLETED: '已完成',
  FAILED: '失败',
  TERMINATED: '已终止',
};
