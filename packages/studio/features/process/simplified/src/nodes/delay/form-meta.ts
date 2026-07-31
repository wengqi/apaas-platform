export const DelayFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '延时配置' },
    fields: [
      {
        type: 'number',
        key: 'duration',
        label: '延时时长',
        placeholder: '数字',
      },
      {
        type: 'select',
        key: 'unit',
        label: '时间单位',
        options: [
          { label: '秒', value: 'SECONDS' },
          { label: '分钟', value: 'MINUTES' },
          { label: '小时', value: 'HOURS' },
          { label: '天', value: 'DAYS' },
        ],
      },
    ],
  }),
};
