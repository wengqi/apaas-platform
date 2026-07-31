export const TriggerFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '触发器配置' },
    fields: [
      {
        type: 'select',
        key: 'triggerType',
        label: '触发类型',
        options: [
          { label: '记录创建', value: 'RECORD_CREATED' },
          { label: '记录更新', value: 'RECORD_UPDATED' },
          { label: '定时触发', value: 'SCHEDULED' },
          { label: 'API 触发', value: 'API' },
          { label: '手动触发', value: 'MANUAL' },
        ],
      },
      {
        type: 'select',
        key: 'objectId',
        label: '关联对象',
        placeholder: '选择触发关联的对象',
        // Phase 1 后从元数据 API 动态加载选项
        options: [],
      },
      {
        type: 'json',
        key: 'triggerCondition',
        label: '触发条件',
        placeholder: '满足条件时才触发（可选）',
      },
    ],
  }),
};
