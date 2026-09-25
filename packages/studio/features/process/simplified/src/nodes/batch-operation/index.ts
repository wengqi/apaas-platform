import type { FlowNodeRegistry } from '../../typings.js';

/**
 * 批量操作节点 — 对对象记录执行批量创建/更新/删除。
 * 行数受 BATCH_MAX_ROWS 环境变量约束（默认 500）。
 */
export const BatchOperationNodeRegistry: FlowNodeRegistry = {
  type: 'batch_operation',
  meta: {},
  info: {
    icon: '📦',
    description: '批量操作：批量创建/更新/删除记录。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '批量操作' },
      fields: [
        {
          type: 'select',
          key: 'operation',
          label: '操作类型',
          options: [
            { label: '批量创建', value: 'create' },
            { label: '批量更新', value: 'update' },
            { label: '批量删除', value: 'delete' },
          ],
        },
      ],
    }),
  },
};
