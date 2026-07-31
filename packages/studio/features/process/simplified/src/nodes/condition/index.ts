import type { FlowNodeRegistry } from '../../typings.js';
import { ConditionFormMeta } from './form-meta.js';

/**
 * 条件分支节点 — IF/ELSE 条件判断，支持多分支。
 */
export const ConditionNodeRegistry: FlowNodeRegistry = {
  type: 'condition',
  meta: {
    blocks: ['ifBlock', 'elseBlock'],
  },
  info: {
    icon: '🔀',
    description: '条件分支：根据条件走不同路径（IF/ELSE）。',
  },
  formMeta: ConditionFormMeta,
};
