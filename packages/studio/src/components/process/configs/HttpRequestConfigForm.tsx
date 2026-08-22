/**
 * HTTP 请求节点配置表单 — 支持连接器引用和直连两种模式。
 *
 * 选择连接器后：隐藏 URL，显示操作选择器（从连接器配置加载）。
 * 未选择连接器时：保持原有直连模式（URL + method）。
 */

import { useQuery } from '@tanstack/react-query';
import { Divider, Form, Input, Select, Space, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import FieldMapper from '../FieldMapper.js';
import { connectorsApi, type ConnectorOperation } from '../../../api/connectors.js';

const { Text } = Typography;

export interface HttpRequestConfigData {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  responseMapping?: Record<string, string>;
  title?: string;
  /** 连接器 ID（选择后使用连接器配置） */
  connectorId?: string;
  /** 连接器操作 ID */
  operationId?: string;
  /** 覆盖路径（相对于 connector.baseUrl） */
  path?: string;
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

interface HttpConfig {
  operations?: ConnectorOperation[];
}

export default function HttpRequestConfigForm({
  data,
  onChange,
  disabled = false,
}: HttpRequestConfigFormProps) {
  const update = (patch: Partial<HttpRequestConfigData>) => onChange({ ...data, ...patch });

  const { appId } = useParams<{ appId: string }>();

  // 加载连接器列表
  const { data: connectors } = useQuery({
    queryKey: ['connectors', appId],
    queryFn: () => connectorsApi.list(appId!),
    enabled: !!appId,
  });

  // 加载选中连接器的详情（获取操作列表）
  const { data: selectedConnector } = useQuery({
    queryKey: ['connector', data.connectorId],
    queryFn: () => connectorsApi.get(data.connectorId!),
    enabled: !!data.connectorId,
  });

  const httpConnectors = (connectors ?? []).filter((c) => c.type === 'HTTP');
  const operations = ((selectedConnector?.config ?? {}) as unknown as HttpConfig).operations ?? [];

  const method = data.method || 'GET';
  const showBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const useConnector = !!data.connectorId;

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        HTTP 请求
      </Divider>

      <Form.Item label="连接器（可选）">
        <Select
          value={data.connectorId}
          onChange={(v) =>
            update({
              connectorId: v,
              operationId: undefined,
              path: undefined,
              url: undefined,
            })
          }
          allowClear
          placeholder="不使用连接器，直接填写 URL"
          options={httpConnectors.map((c) => ({
            value: c.id,
            label: `${c.name} (${c.apiName})`,
          }))}
        />
      </Form.Item>

      {useConnector ? (
        <>
          {operations.length > 0 && (
            <Form.Item label="操作">
              <Select
                value={data.operationId}
                onChange={(v) => {
                  const op = operations.find((o) => o.id === v);
                  update({
                    operationId: v,
                    method: op?.method,
                    path: op?.path,
                  });
                }}
                allowClear
                placeholder="选择预定义操作"
                options={operations.map((o) => ({
                  value: o.id,
                  label: `${o.method} ${o.path} — ${o.name}`,
                }))}
              />
            </Form.Item>
          )}
          {!data.operationId && (
            <Space>
              <Select
                value={data.method}
                onChange={(v) => update({ method: v })}
                style={{ width: 100 }}
                options={METHOD_OPTIONS}
              />
              <Input
                value={data.path}
                onChange={(e) => update({ path: e.target.value })}
                placeholder="/users/{id}"
                style={{ width: 200 }}
              />
            </Space>
          )}
          {selectedConnector?.baseUrl && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Base URL: {selectedConnector.baseUrl}
            </Text>
          )}
        </>
      ) : (
        <>
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
        </>
      )}

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
