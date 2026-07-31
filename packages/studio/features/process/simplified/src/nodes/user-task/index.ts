import type { FlowNodeRegistry } from '../../typings.js';
import { UserTaskFormMeta } from './form-meta.js';

/**
 * 审批/人工任务节点 — 流程暂停，等待人工处理。
 * 对接 aPaaS 权限系统的审批人/候选组。
 */
export const UserTaskNodeRegistry: FlowNodeRegistry = {
  type: 'userTask',
  meta: {},
  info: {
    icon: '✅',
    description: '审批/人工任务：流程暂停，等待指定人员审批或处理。',
  },
  formMeta: UserTaskFormMeta,
};
