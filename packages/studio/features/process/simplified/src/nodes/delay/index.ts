import type { FlowNodeRegistry } from '../../typings.js';
import { DelayFormMeta } from './form-meta.js';

/**
 * 延时节点 — 流程暂停指定时间后继续。
 */
export const DelayNodeRegistry: FlowNodeRegistry = {
  type: 'delay',
  meta: {},
  info: {
    icon: '⏱️',
    description: '延时等待：流程暂停指定时间后继续执行。',
  },
  formMeta: DelayFormMeta,
};
