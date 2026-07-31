/**
 * 开始节点 — 流程入口，定义流程输入参数。
 */
import type { FlowNodeRegistry } from '../../typings.js';
import { StartFormMeta } from './form-meta.js';

export const StartNodeRegistry: FlowNodeRegistry = {
  type: 'start',
  meta: {
    isStart: true,
    deleteDisable: true,
    selectable: false,
    copyDisable: true,
    expandable: false,
    addDisable: true,
  },
  info: {
    icon: '🏁',
    description: '流程开始节点，定义流程的输入参数和触发条件。',
  },
  formMeta: StartFormMeta,
};
