export const EndFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '结束节点' },
    fields: [
      {
        type: 'json',
        key: 'outputs',
        label: '输出结果',
        placeholder: '流程最终输出（可选）',
      },
    ],
  }),
};
