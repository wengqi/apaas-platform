import type { FlowNodeRegistry } from '../../typings.js';

/** 跳出循环节点 — 立即终止所在循环，跳到循环完成边。 */
export const BreakNodeRegistry: FlowNodeRegistry = {
  type: 'break',
  meta: {},
  info: {
    icon: '🛑',
    description: '跳出循环：终止所在循环并继续循环后的流程。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '跳出循环' },
      fields: [],
    }),
  },
};
