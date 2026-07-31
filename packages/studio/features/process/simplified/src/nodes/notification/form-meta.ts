export const NotificationFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '通知配置' },
    fields: [
      {
        type: 'select',
        key: 'channel',
        label: '通知渠道',
        options: [
          { label: '邮件', value: 'EMAIL' },
          { label: '站内消息', value: 'IN_APP' },
          { label: 'Webhook', value: 'WEBHOOK' },
        ],
      },
      {
        type: 'text',
        key: 'recipient',
        label: '收件人',
        placeholder: '收件人邮箱/用户ID/Webhook URL',
      },
      {
        type: 'text',
        key: 'subject',
        label: '标题',
        placeholder: '通知标题',
      },
      {
        type: 'textarea',
        key: 'body',
        label: '内容',
        placeholder: '通知正文（支持变量插值）',
      },
    ],
  }),
};
