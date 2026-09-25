/**
 * aPaaS 业务节点注册表
 *
 * 对齐 flowgram.ai 官方最佳实践:
 *  - 不覆盖 blockIcon/blockOrderIcon 注册表（使用 flowgram 默认值）
 *  - 不设 meta.size（继承 DEFAULT_SIZE 280x60）
 *  - 条件分支/包容分支节点使用 extend: 'dynamicSplit'
 *  - 历史物料注册名用驼峰（objectOperation 等），序列化到 SSOT 时由
 *    schema-serializer 统一转 snake_case（引擎注册名）；新物料直接用 snake_case
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
import { InclusiveNodeRegistry } from './inclusive/index.js';
import { ParallelNodeRegistry } from './parallel/index.js';
import { LoopNodeRegistry } from './loop/index.js';
import { WaitForConditionNodeRegistry } from './wait-for-condition/index.js';
import { BreakNodeRegistry } from './break/index.js';
import { ContinueNodeRegistry } from './continue/index.js';
import { BatchOperationNodeRegistry } from './batch-operation/index.js';
import { SubProcessNodeRegistry } from './sub-process/index.js';

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
  InclusiveNodeRegistry,
  ParallelNodeRegistry,
  LoopNodeRegistry,
  WaitForConditionNodeRegistry,
  BreakNodeRegistry,
  ContinueNodeRegistry,
  BatchOperationNodeRegistry,
  SubProcessNodeRegistry,
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
  InclusiveNodeRegistry,
  ParallelNodeRegistry,
  LoopNodeRegistry,
  WaitForConditionNodeRegistry,
  BreakNodeRegistry,
  ContinueNodeRegistry,
  BatchOperationNodeRegistry,
  SubProcessNodeRegistry,
  UserTaskNodeRegistry,
  NotificationNodeRegistry,
  HttpRequestNodeRegistry,
  AssignNodeRegistry,
  DelayNodeRegistry,
};
