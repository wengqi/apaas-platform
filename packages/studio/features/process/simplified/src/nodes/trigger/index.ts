import type { FlowNodeRegistry } from '../../typings.js';
import { TriggerFormMeta } from './form-meta.js';

/**
 * 触发器节点 — 定义流程何时自动执行。
 * 类型：RECORD_CREATED / RECORD_UPDATED / RECORD_DELETED / SCHEDULED / API / MANUAL / BUTTON_CLICK
 */
export const TriggerNodeRegistry: FlowNodeRegistry = {
  type: 'trigger',
  meta: {
    deleteDisable: false,
  },
  info: {
    icon: '⚡',
    description: '触发器：当记录创建/更新、定时、API 调用时自动执行流程。',
  },
  formMeta: TriggerFormMeta,
};
