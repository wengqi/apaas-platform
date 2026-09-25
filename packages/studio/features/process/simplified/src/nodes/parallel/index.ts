import type { FlowNodeRegistry } from '../../typings.js';

/**
 * 并行分支节点 — 所有分支同时执行，汇聚点等待全部完成（严格 AND-join）。
 *
 * 执行引擎在分支分裂时注册汇聚等待：全部分支令牌到齐后放行汇聚节点。
 */
export const ParallelNodeRegistry: FlowNodeRegistry = {
  type: 'parallel',
  meta: {
    expandable: false,
  },
  info: {
    icon: '⇉',
    description: '并行分支：所有分支同时执行，汇聚等待全部完成。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '并行分支' },
      fields: [],
    }),
  },
};
