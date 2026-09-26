/**
 * 从 constants/process.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 流程引擎基础类型定义(状态 / 触发器 / 节点分类)。
 * 对齐 DESIGN-process.md §9.2 / §9.3 / §9.4 与 shared 枚举大写值 + Prisma 枚举。
 */

import type { ComponentType } from 'react';

/** AntD 图标组件类型(所有 @ant-design/icons 共享同一类型)。 */
export type IconType = ComponentType<{ style?: React.CSSProperties }>;

// ---------------------------------------------------------------------------
// 流程状态 / 触发器类型(对齐 shared 枚举大写值 + Prisma 枚举)
// ---------------------------------------------------------------------------

export type ProcessStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type TriggerType =
  | 'RECORD_CREATED'
  | 'RECORD_UPDATED'
  | 'RECORD_DELETED'
  | 'SCHEDULED'
  | 'MANUAL'
  | 'API'
  | 'BUTTON_CLICK';

/** 流程实例状态(对齐 shared ProcessInstanceState)。 */
export type ProcessInstanceState =
  'RUNNING' | 'WAITING_USER_TASK' | 'COMPLETED' | 'FAILED' | 'TERMINATED';

/** 节点执行状态(对齐 shared NodeExecutionStatus.state / Prisma NodeExecStatus)。 */
export type NodeExecutionState =
  'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'WAITING' | 'SKIPPED';

/** 通知渠道。 */
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'WEBHOOK';

/** 节点面板分类。 */
export type NodeCategory = 'trigger' | 'data' | 'control' | 'business';

/** 节点元数据。 */
export interface ProcessNodeMeta {
  /** flowgram 注册表 type(驼峰,画布节点 WorkflowNode.type) */
  type: string;
  /** 中文显示名 */
  label: string;
  /** 图标组件 */
  icon: IconType;
  /** 图标块色 */
  color: string;
  /** 分类 */
  category: NodeCategory;
  /** 简短描述 */
  description: string;
}
