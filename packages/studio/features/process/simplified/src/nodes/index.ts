/**
 * aPaaS 业务节点注册表
 *
 * 对齐 flowgram.ai 官方最佳实践:
 *  - 不覆盖 blockIcon/blockOrderIcon 注册表（使用 flowgram 默认值）
 *  - 不设 meta.size（继承 DEFAULT_SIZE 280x60）
 *  - 条件分支节点使用 extend: 'dynamicSplit'
 */

import type { FlowNodeRegistry } from '../typings.js';

import { StartNodeRegistry } from './start/index.js';
import { EndNodeRegistry } from './end/index.js';
import { TriggerNodeRegistry } from './trigger/index.js';
import { ObjectOperationNodeRegistry } from './object-operation/index.js';
import { ConditionNodeRegistry } from './condition/index.js';
import { UserTaskNodeRegistry } from './user-task/index.js';
import { NotificationNodeRegistry } from './notification/index.js';
import { HttpRequestNodeRegistry } from './http-request/index.js';
import { AssignNodeRegistry } from './assign/index.js';
import { DelayNodeRegistry } from './delay/index.js';

/**
 * aPaaS 全部业务节点注册表。
 * 传入 FixedLayoutEditorProvider 的 nodeRegistries 配置。
 */
export const ApaasNodeRegistries: FlowNodeRegistry[] = [
  StartNodeRegistry,
  EndNodeRegistry,
  TriggerNodeRegistry,
  ObjectOperationNodeRegistry,
  ConditionNodeRegistry,
  UserTaskNodeRegistry,
  NotificationNodeRegistry,
  HttpRequestNodeRegistry,
  AssignNodeRegistry,
  DelayNodeRegistry,
];

export {
  StartNodeRegistry,
  EndNodeRegistry,
  TriggerNodeRegistry,
  ObjectOperationNodeRegistry,
  ConditionNodeRegistry,
  UserTaskNodeRegistry,
  NotificationNodeRegistry,
  HttpRequestNodeRegistry,
  AssignNodeRegistry,
  DelayNodeRegistry,
};
