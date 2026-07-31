export const ObjectOperationFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '对象操作' },
    fields: [
      {
        type: 'select',
        key: 'operation',
        label: '操作类型',
        options: [
          { label: '创建记录', value: 'CREATE' },
          { label: '更新记录', value: 'UPDATE' },
          { label: '删除记录', value: 'DELETE' },
          { label: '查询记录', value: 'QUERY' },
          { label: '更新或创建', value: 'UPSERT' },
        ],
      },
      {
        type: 'select',
        key: 'objectId',
        label: '目标对象',
        placeholder: '选择操作的对象',
        options: [],
      },
      {
        type: 'json',
        key: 'fieldMapping',
        label: '字段映射',
        placeholder: '将流程变量映射到对象字段',
      },
      {
        type: 'json',
        key: 'queryFilter',
        label: '查询条件',
        placeholder: '查询/更新/删除时的筛选条件',
      },
    ],
  }),
};
