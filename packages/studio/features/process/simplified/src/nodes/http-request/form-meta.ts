export const HttpRequestFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: 'HTTP 请求' },
    fields: [
      {
        type: 'select',
        key: 'method',
        label: '请求方法',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'PATCH', value: 'PATCH' },
          { label: 'DELETE', value: 'DELETE' },
        ],
      },
      {
        type: 'text',
        key: 'url',
        label: '请求 URL',
        placeholder: 'https://api.example.com/endpoint',
      },
      {
        type: 'json',
        key: 'headers',
        label: '请求头',
        placeholder: '{"Content-Type": "application/json"}',
      },
      {
        type: 'json',
        key: 'body',
        label: '请求体',
        placeholder: '请求体 JSON（支持变量插值）',
      },
    ],
  }),
};
