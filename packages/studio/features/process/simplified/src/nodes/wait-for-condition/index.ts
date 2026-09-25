import type { FlowNodeRegistry } from '../../typings.js';

/**
 * 等待条件节点 — 暂停流程直到条件成立（BullMQ 延迟任务轮询重查，非 setInterval）。
 * 超时后路由 label 为 timeout 的出边（未配置则实例置 FAILED）。
 */
export const WaitForConditionNodeRegistry: FlowNodeRegistry = {
  type: 'wait_for_condition',
  meta: {},
  info: {
    icon: '⏳',
    description: '等待条件：暂停直到条件成立或超时。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '等待条件' },
      fields: [
        {
          type: 'input',
          key: 'pollIntervalMs',
          label: '检查间隔（ms）',
          placeholder: '默认 60000',
        },
        {
          type: 'input',
          key: 'timeoutMs',
          label: '超时（ms）',
          placeholder: '默认 86400000（24h）',
        },
      ],
    }),
  },
};
