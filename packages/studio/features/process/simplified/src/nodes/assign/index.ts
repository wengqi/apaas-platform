import type { FlowNodeRegistry } from '../../typings.js';
import { AssignFormMeta } from './form-meta.js';

/**
 * 变量赋值节点 — 设置/修改流程变量。
 */
export const AssignNodeRegistry: FlowNodeRegistry = {
  type: 'assign',
  meta: {},
  info: {
    icon: '📝',
    description: '变量赋值：设置或修改流程变量的值。',
  },
  formMeta: AssignFormMeta,
};
