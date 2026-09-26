/**
 * 流程引擎 常量表 —— 单一数据源,驱动节点面板、流程卡片、状态着色。
 *
 * 对齐 DESIGN-process.md §9.2 / §9.3 / §9.4。
 * 节点 type 取 flowgram 注册表实际使用的驼峰名(start/end/trigger/
 * objectOperation/condition/userTask/notification/httpRequest/assign/delay),
 * 与画布节点 WorkflowNode.type 一致。
 *
 * 拆分说明（AGENTS.md 单文件 400 行规范）：
 * - 基础类型定义 → ./process/types.js
 * - 节点元数据 → ./process/node-meta.js
 * - 触发器元数据 → ./process/trigger-meta.js
 * - 状态颜色元数据 → ./process/status-meta.js
 * 本文件保持原有导出面不变,继续作为兼容入口。
 */

export type {
  ProcessStatus,
  TriggerType,
  ProcessInstanceState,
  NodeExecutionState,
  NotificationChannel,
  NodeCategory,
  ProcessNodeMeta,
} from './process/types.js';

export { NODE_META, NODE_GROUPS, NODE_COMING_SOON, getNodeMeta } from './process/node-meta.js';

export type { TriggerMeta } from './process/trigger-meta.js';
export { TRIGGER_META, TRIGGER_OPTIONS, getTriggerMeta } from './process/trigger-meta.js';

export type { ProcessStatusMeta, InstanceStateMeta, NodeStateMeta } from './process/status-meta.js';
export {
  PROCESS_STATUS_META,
  getProcessStatusMeta,
  INSTANCE_STATE_META,
  getInstanceStateMeta,
  NODE_STATE_META,
  getNodeStateMeta,
  NOTIFICATION_CHANNEL_META,
  NOTIFICATION_CHANNEL_OPTIONS,
} from './process/status-meta.js';
