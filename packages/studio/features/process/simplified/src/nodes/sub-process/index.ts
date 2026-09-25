import type { FlowNodeRegistry } from '../../typings.js';

/**
 * 子流程调用节点 — 调用另一个已发布流程。
 * 默认同步等待子流程完成后继续（子实例失败时父实例同步失败）。
 */
export const SubProcessNodeRegistry: FlowNodeRegistry = {
  type: 'sub_process',
  meta: {},
  info: {
    icon: '🧩',
    description: '子流程：调用另一个已发布流程（默认同步等待）。',
  },
  formMeta: {
    render: () => ({
      type: 'group',
      properties: { title: '子流程调用' },
      fields: [
        {
          type: 'input',
          key: 'subProcessKey',
          label: '子流程 API 名称',
          placeholder: '同应用内已发布流程的 apiName',
        },
      ],
    }),
  },
};
