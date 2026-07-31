export const ConditionFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '条件分支' },
    fields: [
      {
        type: 'json',
        key: 'conditions',
        label: '条件表达式',
        placeholder: '条件表达式数组，支持 AND/OR 组合',
      },
    ],
  }),
};
