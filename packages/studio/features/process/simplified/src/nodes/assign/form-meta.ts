export const AssignFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '变量赋值' },
    fields: [
      {
        type: 'text',
        key: 'variableName',
        label: '变量名',
        placeholder: '要赋值的变量名',
      },
      {
        type: 'json',
        key: 'value',
        label: '值',
        placeholder: '变量值（支持常量/引用/表达式/模板）',
      },
    ],
  }),
};
