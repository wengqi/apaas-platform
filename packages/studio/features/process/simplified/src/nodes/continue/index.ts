import type { FlowNodeRegistry } from '../../typings.js';

/** 继续下一次循环节点 — 跳过本次迭代剩余节点，直接回到循环节点。 */
export const ContinueNodeRegistry: FlowNodeRegistry = {
  type: 'continue',
  meta: {},
  info: {
    icon: '⏭️',
    description: '继续循环：跳过本次迭代剩余节点，进入下一次迭代。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '继续循环' },
      fields: [],
    }),
  },
};
