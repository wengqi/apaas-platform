/**
 * 流程引擎 常量表 —— 单一数据源,驱动节点面板、流程卡片、状态着色。
 *
 * 对齐 DESIGN-process.md §9.2 / §9.3 / §9.4。
 * 节点 type 取 flowgram 注册表实际使用的驼峰名(start/end/trigger/
 * objectOperation/condition/userTask/notification/httpRequest/assign/delay),
 * 与画布节点 WorkflowNode.type 一致。
 */

import type { ComponentType } from 'react';
import {
  ThunderboltOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DatabaseOutlined,
  BranchesOutlined,
  SolutionOutlined,
  BellOutlined,
  ApiOutlined,
  EditOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';

/** AntD 图标组件类型(所有 @ant-design/icons 共享同一类型)。 */
type IconType = ComponentType<{ style?: React.CSSProperties }>;

// ---------------------------------------------------------------------------
// 编辑模式 / 流程状态 / 触发器类型(字符串字面量,对齐 shared 枚举)
// ---------------------------------------------------------------------------

export type EditorMode = 'simplified' | 'standard';

export type ProcessStatus = 'draft' | 'published' | 'deprecated';

export type TriggerType = 'record_event' | 'schedule' | 'manual' | 'button_click';

/** 流程实例状态(对齐 shared ProcessInstanceState)。 */
export type ProcessInstanceState =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'terminated'
  | 'cancelled';

/** 节点执行状态(对齐 shared NodeExecutionStatus.state)。 */
export type NodeExecutionState =
  | 'idle'
  | 'processing'
  | 'success'
  | 'fail'
  | 'waiting'
  | 'skipped';

/** 通知渠道。 */
export type NotificationChannel = 'in_app' | 'email' | 'webhook';

// ---------------------------------------------------------------------------
// 节点元数据(10 种 aPaaS 业务节点,对齐 ApaasNodeRegistries)
// ---------------------------------------------------------------------------

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

/**
 * 节点类型元数据表 —— 驱动节点面板、节点配置头。
 * type 与 features/process/simplified/src/nodes/*/index.ts 的注册表 type 对齐。
 */
export const NODE_META: Record<string, ProcessNodeMeta> = {
  // —— 触发与起止 ——
  trigger: {
    type: 'trigger',
    label: '触发器',
    icon: ThunderboltOutlined,
    color: '#fa8c16',
    category: 'trigger',
    description: '流程入口:记录增删改/定时/手动/按钮触发',
  },
  start: {
    type: 'start',
    label: '开始',
    icon: PlayCircleOutlined,
    color: '#52c41a',
    category: 'trigger',
    description: '流程开始节点,定义输入参数',
  },
  end: {
    type: 'end',
    label: '结束',
    icon: StopOutlined,
    color: '#8c8c8c',
    category: 'trigger',
    description: '流程结束节点',
  },
  // —— 数据操作 ——
  objectOperation: {
    type: 'objectOperation',
    label: '对象操作',
    icon: DatabaseOutlined,
    color: '#1677ff',
    category: 'data',
    description: '创建/更新/查询/删除记录',
  },
  // —— 流程控制 ——
  condition: {
    type: 'condition',
    label: '条件分支',
    icon: BranchesOutlined,
    color: '#722ed1',
    category: 'control',
    description: 'if/else 条件分支',
  },
  // —— 业务操作 ——
  userTask: {
    type: 'userTask',
    label: '人工任务',
    icon: SolutionOutlined,
    color: '#13c2c2',
    category: 'business',
    description: '审批/人工任务,流程暂停等待处理',
  },
  notification: {
    type: 'notification',
    label: '通知',
    icon: BellOutlined,
    color: '#eb2f96',
    category: 'business',
    description: '发送邮件/站内/Webhook 通知',
  },
  httpRequest: {
    type: 'httpRequest',
    label: 'HTTP 请求',
    icon: ApiOutlined,
    color: '#2f54eb',
    category: 'business',
    description: '调用外部 HTTP 接口/连接器',
  },
  assign: {
    type: 'assign',
    label: '赋值',
    icon: EditOutlined,
    color: '#faad14',
    category: 'business',
    description: '设置流程变量',
  },
  delay: {
    type: 'delay',
    label: '延时',
    icon: ClockCircleOutlined,
    color: '#fa8c16',
    category: 'business',
    description: '等待指定时长',
  },
};

/** 节点面板分组(顺序即展示顺序)。 */
export const NODE_GROUPS: { title: string; category: NodeCategory; types: string[] }[] = [
  { title: '触发与起止', category: 'trigger', types: ['trigger', 'start', 'end'] },
  { title: '数据操作', category: 'data', types: ['objectOperation'] },
  { title: '流程控制', category: 'control', types: ['condition'] },
  {
    title: '业务操作',
    category: 'business',
    types: ['userTask', 'notification', 'httpRequest', 'assign', 'delay'],
  },
];

/** 即将支持的扩展节点(灰态展示)。 */
export const NODE_COMING_SOON: { type: string; label: string }[] = [
  { type: 'parallel', label: '并行分支' },
  { type: 'inclusive', label: '包容分支' },
  { type: 'loop', label: '循环' },
  { type: 'sub_process', label: '子流程' },
];

/**
 * 安全获取节点元数据(兼容 noUncheckedIndexedAccess,提供兜底)。
 */
export function getNodeMeta(type: string): ProcessNodeMeta {
  const meta = NODE_META[type];
  if (meta) return meta;
  return {
    type,
    label: type,
    icon: ThunderboltOutlined,
    color: '#8c8c8c',
    category: 'business',
    description: '',
  };
}

// ---------------------------------------------------------------------------
// 触发器类型映射(流程卡片 + 工具栏图标块)
// ---------------------------------------------------------------------------

export interface TriggerMeta {
  type: TriggerType;
  label: string;
  icon: IconType;
  color: string;
}

export const TRIGGER_META: Record<TriggerType, TriggerMeta> = {
  record_event: {
    type: 'record_event',
    label: '记录事件触发',
    icon: DatabaseOutlined,
    color: '#1677ff',
  },
  schedule: {
    type: 'schedule',
    label: '定时触发',
    icon: ClockCircleOutlined,
    color: '#fa8c16',
  },
  manual: {
    type: 'manual',
    label: '手动触发',
    icon: UserOutlined,
    color: '#52c41a',
  },
  button_click: {
    type: 'button_click',
    label: '按钮点击触发',
    icon: ThunderboltOutlined,
    color: '#722ed1',
  },
};

/** 触发器选项(用于 Select)。 */
export const TRIGGER_OPTIONS: { label: string; value: TriggerType }[] = (
  Object.values(TRIGGER_META) as TriggerMeta[]
).map((m) => ({ label: m.label, value: m.type }));

/** 安全获取触发器元数据。 */
export function getTriggerMeta(type?: string): TriggerMeta {
  if (type && type in TRIGGER_META) {
    return TRIGGER_META[type as TriggerType];
  }
  return {
    type: 'manual',
    label: '手动触发',
    icon: UserOutlined,
    color: '#52c41a',
  };
}

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
  draft: { label: '草稿', tagColor: 'orange', dotColor: '#fa8c16' },
  published: { label: '已发布', tagColor: 'green', dotColor: '#52c41a' },
  deprecated: { label: '已弃用', tagColor: 'default', dotColor: '#8c8c8c' },
};

export function getProcessStatusMeta(status: string): ProcessStatusMeta {
  return PROCESS_STATUS_META[status as ProcessStatus] ?? PROCESS_STATUS_META.draft;
}

/** 编辑模式标记。 */
export const EDITOR_MODE_META: Record<
  EditorMode,
  { label: string; tagColor: string }
> = {
  simplified: { label: '简化', tagColor: 'blue' },
  standard: { label: '标准', tagColor: 'geekblue' },
};

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
  pending: { label: '等待中', badgeStatus: 'default', color: '#8c8c8c' },
  running: { label: '运行中', badgeStatus: 'processing', color: '#1677ff' },
  waiting: { label: '等待中', badgeStatus: 'warning', color: '#fa8c16' },
  completed: { label: '已完成', badgeStatus: 'success', color: '#52c41a' },
  failed: { label: '失败', badgeStatus: 'error', color: '#ff4d4f' },
  terminated: { label: '已终止', badgeStatus: 'default', color: '#8c8c8c' },
  cancelled: { label: '已取消', badgeStatus: 'default', color: '#8c8c8c' },
};

export function getInstanceStateMeta(
  state: string,
): InstanceStateMeta {
  return (
    INSTANCE_STATE_META[state as ProcessInstanceState] ?? INSTANCE_STATE_META.pending
  );
}

/** 节点执行状态色(用于监控节点状态着色)。 */
export interface NodeStateMeta {
  label: string;
  color: string;
  /** AntD Badge status */
  badgeStatus: 'processing' | 'warning' | 'success' | 'error' | 'default';
}

export const NODE_STATE_META: Record<NodeExecutionState, NodeStateMeta> = {
  success: { label: '已执行', color: '#52c41a', badgeStatus: 'success' },
  processing: { label: '执行中', color: '#1677ff', badgeStatus: 'processing' },
  waiting: { label: '等待中', color: '#fa8c16', badgeStatus: 'warning' },
  idle: { label: '待执行', color: '#d9d9d9', badgeStatus: 'default' },
  fail: { label: '失败', color: '#ff4d4f', badgeStatus: 'error' },
  skipped: { label: '跳过', color: '#bfbfbf', badgeStatus: 'default' },
};

export function getNodeStateMeta(state: string): NodeStateMeta {
  return NODE_STATE_META[state as NodeExecutionState] ?? NODE_STATE_META.idle;
}

// ---------------------------------------------------------------------------
// 通知渠道元数据
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNEL_META: Record<
  NotificationChannel,
  { label: string; tagColor: string }
> = {
  email: { label: '邮件', tagColor: 'blue' },
  in_app: { label: '站内', tagColor: 'green' },
  webhook: { label: 'Webhook', tagColor: 'purple' },
};

export const NOTIFICATION_CHANNEL_OPTIONS: { label: string; value: NotificationChannel }[] = [
  { label: '邮件', value: 'email' },
  { label: '站内', value: 'in_app' },
  { label: 'Webhook', value: 'webhook' },
];
