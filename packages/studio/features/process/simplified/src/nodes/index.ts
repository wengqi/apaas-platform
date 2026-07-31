/**
 * aPaaS 业务节点注册表
 *
 * 替换 flowgram.ai 默认节点（LLM/Agent/Code）为 aPaaS 流程节点。
 * 对齐 packages/shared/src/process/index.ts 中的 SimplifiedNodeType。
 *
 * 节点类型：
 *  - start:         开始节点（流程入口）
 *  - end:           结束节点
 *  - trigger:       触发器（记录创建/更新/定时/API 触发）
 *  - objectOperation: 对象操作（创建/更新/删除/查询记录）
 *  - condition:     条件分支（IF/ELSE）
 *  - userTask:      审批/人工任务
 *  - notification:  通知（邮件/消息）
 *  - httpRequest:   HTTP 请求
 *  - assign:        变量赋值
 *  - delay:         延时
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
