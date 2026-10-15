/**
 * 从 constants/process.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 流程状态 / 实例状态 / 节点执行状态 / 通知渠道的颜色元数据。
 * 对齐 DESIGN-process.md §9.3 / §9.4 / §8.2。
 */

import { TOKENS as T } from '@apaas/shared/design';
import type {
  NodeExecutionState,
  NotificationChannel,
  ProcessInstanceState,
  ProcessStatus,
} from './types.js';

// ---------------------------------------------------------------------------
// 流程状态颜色(对齐 §9.3)
// ---------------------------------------------------------------------------

export interface ProcessStatusMeta {
  label: string;
  /** AntD Tag color */
  tagColor: string;
  /** 圆点色 */
  dotColor: string;
}

export const PROCESS_STATUS_META: Record<ProcessStatus, ProcessStatusMeta> = {
  DRAFT: { label: '草稿', tagColor: 'orange', dotColor: T.colorWarning },
  PUBLISHED: { label: '已发布', tagColor: 'green', dotColor: T.colorSuccess },
  ARCHIVED: { label: '已归档', tagColor: 'default', dotColor: T.colorTextTertiary },
};

export function getProcessStatusMeta(status: string): ProcessStatusMeta {
  return PROCESS_STATUS_META[status as ProcessStatus] ?? PROCESS_STATUS_META.DRAFT;
}

// ---------------------------------------------------------------------------
// 实例 / 节点执行状态颜色(对齐 §9.4 / §8.2)
// ---------------------------------------------------------------------------

export interface InstanceStateMeta {
  label: string;
  /** AntD Badge status */
  badgeStatus: 'processing' | 'warning' | 'success' | 'error' | 'default';
  /** 状态色 */
  color: string;
}

export const INSTANCE_STATE_META: Record<ProcessInstanceState, InstanceStateMeta> = {
  RUNNING: { label: '运行中', badgeStatus: 'processing', color: T.colorPrimary },
  WAITING_USER_TASK: { label: '等待中', badgeStatus: 'warning', color: T.colorWarning },
  COMPLETED: { label: '已完成', badgeStatus: 'success', color: T.colorSuccess },
  FAILED: { label: '失败', badgeStatus: 'error', color: T.colorError },
  TERMINATED: { label: '已终止', badgeStatus: 'default', color: T.colorTextTertiary },
};

export function getInstanceStateMeta(state: string): InstanceStateMeta {
  return INSTANCE_STATE_META[state as ProcessInstanceState] ?? INSTANCE_STATE_META.RUNNING;
}

/** 节点执行状态色(用于监控节点状态着色)。 */
export interface NodeStateMeta {
  label: string;
  color: string;
  /** AntD Badge status */
  badgeStatus: 'processing' | 'warning' | 'success' | 'error' | 'default';
}

export const NODE_STATE_META: Record<NodeExecutionState, NodeStateMeta> = {
  COMPLETED: { label: '已执行', color: T.colorSuccess, badgeStatus: 'success' },
  RUNNING: { label: '执行中', color: T.colorPrimary, badgeStatus: 'processing' },
  WAITING: { label: '等待中', color: T.colorWarning, badgeStatus: 'warning' },
  PENDING: { label: '待执行', color: T.colorBorder, badgeStatus: 'default' },
  FAILED: { label: '失败', color: T.colorError, badgeStatus: 'error' },
  SKIPPED: { label: '跳过', color: T.colorTextQuaternary, badgeStatus: 'default' },
};

export function getNodeStateMeta(state: string): NodeStateMeta {
  return NODE_STATE_META[state as NodeExecutionState] ?? NODE_STATE_META.PENDING;
}

// ---------------------------------------------------------------------------
// 通知渠道元数据
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNEL_META: Record<
  NotificationChannel,
  { label: string; tagColor: string }
> = {
  EMAIL: { label: '邮件', tagColor: 'blue' },
  IN_APP: { label: '站内', tagColor: 'green' },
  WEBHOOK: { label: 'Webhook', tagColor: 'purple' },
};

export const NOTIFICATION_CHANNEL_OPTIONS: { label: string; value: NotificationChannel }[] = [
  { label: '邮件', value: 'EMAIL' },
  { label: '站内', value: 'IN_APP' },
  { label: 'Webhook', value: 'WEBHOOK' },
];
