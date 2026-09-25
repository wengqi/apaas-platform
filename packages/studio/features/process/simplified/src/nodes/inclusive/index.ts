import type { FlowNodeRegistry } from '../../typings.js';
import { ConditionFormMeta } from '../condition/form-meta.js';

/**
 * 包容分支节点 — 多条件分支，所有满足条件的分支同时执行（OR 语义）。
 *
 * 与 condition 相同使用 extend: 'dynamicSplit'（分支容器 block 结构），
 * 执行引擎对每个满足条件的分支同时发令牌，并在公共汇聚点等待（严格 OR-join）。
 * 配置面板复用 ConditionConfigForm（编辑 data.conditions 分支列表）。
 */
export const InclusiveNodeRegistry: FlowNodeRegistry = {
  type: 'inclusive',
  extend: 'dynamicSplit',
  meta: {
    expandable: false,
  },
  info: {
    icon: '🔀',
    description: '包容分支：所有满足条件的分支并行执行。',
  },
  formMeta: ConditionFormMeta,
};
