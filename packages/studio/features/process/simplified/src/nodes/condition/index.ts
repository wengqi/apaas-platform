import type { FlowNodeRegistry } from '../../typings.js';
import { ConditionFormMeta } from './form-meta.js';

/**
 * 条件分支节点 — IF/ELSE 条件判断，支持多分支。
 *
 * 对齐 flowgram.ai 官方最佳实践:
 *  - 使用 extend: 'dynamicSplit' 继承 DynamicSplitRegistry
 *  - DynamicSplitRegistry.onCreate 自动调用 addInlineBlocks(json.blocks)
 *  - DynamicSplitRegistry 的 getOutputPoint 居中输出点,保证连线垂直
 *  - 不设 meta.size — 继承 DEFAULT_SIZE (280x60)
 */
export const ConditionNodeRegistry: FlowNodeRegistry = {
  type: 'condition',
  extend: 'dynamicSplit',
  meta: {
    expandable: false,
  },
  formMeta: ConditionFormMeta,
};
