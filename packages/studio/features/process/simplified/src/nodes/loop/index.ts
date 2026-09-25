import type { FlowNodeRegistry } from '../../typings.js';

/**
 * 循环节点 — 遍历集合并对每个元素执行循环体。
 *
 * 体边/完成边由引擎按可达性自动分类（体边成环）。
 * 体内节点以 {{loop_x.output.item}} 引用当前元素。
 */
export const LoopNodeRegistry: FlowNodeRegistry = {
  type: 'loop',
  meta: {},
  info: {
    icon: '🔁',
    description: '循环：遍历集合并对每个元素执行循环体。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '循环配置' },
      fields: [
        {
          type: 'input',
          key: 'collection',
          label: '遍历集合（变量引用）',
          placeholder: '如 object_query_0.output.records',
        },
        {
          type: 'number',
          key: 'maxIterations',
          label: '最大迭代次数',
          placeholder: '默认 1000',
        },
      ],
    }),
  },
};
