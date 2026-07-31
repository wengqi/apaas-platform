/**
 * HTTP 请求节点配置表单 —— 对齐 DESIGN-process.md §6.6。
 */

import { Divider, Form, Input, Select } from 'antd';
import FieldMapper from '../FieldMapper.js';

export interface HttpRequestConfigData {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  responseMapping?: Record<string, string>;
  title?: string;
}

export interface HttpRequestConfigFormProps {
  data: HttpRequestConfigData;
  onChange: (data: HttpRequestConfigData) => void;
  disabled?: boolean;
}

const METHOD_OPTIONS = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
];

export default function HttpRequestConfigForm({
  data,
  onChange,
  disabled = false,
}: HttpRequestConfigFormProps) {
  const update = (patch: Partial<HttpRequestConfigData>) =>
    onChange({ ...data, ...patch });

  const method = data.method || 'GET';
  const showBody = method === 'POST' || method === 'PUT' || method === 'PATCH';

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        HTTP 请求
      </Divider>
      <Form.Item label="请求方法" required>
        <Select
          value={data.method}
          onChange={(v) => update({ method: v })}
          options={METHOD_OPTIONS}
        />
      </Form.Item>
      <Form.Item label="请求 URL" required>
        <Input
          value={data.url}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://api.example.com/webhook"
        />
      </Form.Item>
      <Form.Item label="请求头">
        <FieldMapper
          value={data.headers}
          onChange={(v) => update({ headers: v })}
          keyPlaceholder="Content-Type"
          valuePlaceholder="application/json"
          disabled={disabled}
        />
      </Form.Item>
      {showBody && (
        <Form.Item label="请求体">
          <Input.TextArea
            value={data.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder='{ "orderId": "${record.id}" }'
            rows={3}
          />
        </Form.Item>
      )}
      <Form.Item label="响应映射">
        <FieldMapper
          value={data.responseMapping}
          onChange={(v) => update({ responseMapping: v })}
          keyLabel="响应字段(JSONPath)"
          valueLabel="变量名"
          keyPlaceholder="$.data.id"
          valuePlaceholder="apiResultId"
          disabled={disabled}
        />
      </Form.Item>
    </Form>
  );
}
