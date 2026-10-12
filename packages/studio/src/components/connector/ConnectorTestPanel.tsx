/**
 * 连接器调试面板 — 选择操作、填参数、执行调用、查看响应。
 *
 * 在连接器详情 Drawer 中展开，支持 HTTP 类型的连接器测试。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useState } from 'react';
import { Button, Select, Input, Space, Typography, message, Spin } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { connectorsApi, type Connector, type ConnectorOperation } from '../../api/connectors.js';

const { Text } = Typography;

interface ConnectorTestPanelProps {
  connector: Connector;
}

interface HttpConfig {
  operations?: ConnectorOperation[];
}

export default function ConnectorTestPanel({ connector }: ConnectorTestPanelProps) {
  const [operationId, setOperationId] = useState<string | undefined>();
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const config = (connector.config ?? {}) as unknown as HttpConfig;
  const operations = config.operations ?? [];

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await connectorsApi.test(connector.id, {
        operationId: operationId,
        method: operationId ? undefined : method,
        path: operationId ? undefined : path,
        body: body || undefined,
      });
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      const axErr = err as { response?: { data?: { message?: string } }; message?: string };
      setResult(
        JSON.stringify(
          { error: axErr.response?.data?.message ?? axErr.message ?? '调用失败' },
          null,
          2,
        ),
      );
      message.error('调用失败，请查看响应详情');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {operations.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            选择操作
          </Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            placeholder="选择预定义操作（或手动填写）"
            allowClear
            value={operationId}
            onChange={(v) => {
              setOperationId(v);
              if (v) {
                const op = operations.find((o) => o.id === v);
                if (op) {
                  setMethod(op.method);
                  setPath(op.path);
                }
              }
            }}
            options={operations.map((o) => ({
              value: o.id,
              label: `${o.method} ${o.path} — ${o.name}`,
            }))}
          />
        </div>
      )}

      {!operationId && (
        <Space>
          <Select
            value={method}
            onChange={setMethod}
            style={{ width: 100 }}
            options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))}
          />
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/users/123"
            style={{ width: 250 }}
          />
        </Space>
      )}

      {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            请求体
          </Text>
          <Input.TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder='{ "key": "value" }'
            style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>
      )}

      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        loading={loading}
        onClick={handleTest}
        block
      >
        测试调用
      </Button>

      {loading && <Spin />}

      {result && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            响应结果
          </Text>
          <pre
            style={{
              background: T.colorFillQuaternary,
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'monospace',
              maxHeight: 400,
              overflow: 'auto',
              marginTop: 4,
            }}
          >
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
