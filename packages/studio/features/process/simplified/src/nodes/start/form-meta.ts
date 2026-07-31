/**
 * 开始节点表单 — 配置流程输入参数（JSON Schema 格式）。
 * Phase 3 产品闸门后细化。
 */
export const StartFormMeta = {
  render: () => ({
    type: 'group',
    properties: {
      title: '开始节点',
    },
    fields: [
      {
        type: 'json',
        key: 'outputs',
        label: '输入参数',
        placeholder: '定义流程输入参数的 JSON Schema',
      },
    ],
  }),
};
