/**
 * 连接器创建/编辑表单 — Modal 形式。
 *
 * 支持 HTTP（出站调用）和 Webhook（入站触发）两种类型。
 * HTTP 类型可配置 baseUrl、凭证、API 操作定义。
 * Webhook 类型创建后自动生成入站 token。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Space, Typography, message, Divider, Button } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  connectorsApi,
  credentialsApi,
  type Connector,
  type ConnectorType,
  type CreateConnectorRequest,
  type ConnectorOperation,
} from '../../api/connectors.js';

const { Text } = Typography;

interface ConnectorFormModalProps {
  open: boolean;
  appId: string;
  editingConnector?: Connector | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CONNECTOR_TYPES: { value: ConnectorType; label: string; desc: string }[] = [
  { value: 'HTTP', label: 'HTTP 连接器', desc: '调用外部 API（出站）' },
  { value: 'WEBHOOK', label: 'Webhook 接收器', desc: '接收外部请求触发流程（入站）' },
];

export default function ConnectorFormModal({
  open,
  appId,
  editingConnector,
  onClose,
  onSuccess,
}: ConnectorFormModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [connectorType, setConnectorType] = useState<ConnectorType>('HTTP');
  const [credentials, setCredentials] = useState<Awaited<ReturnType<typeof credentialsApi.list>>>(
    [],
  );

  useEffect(() => {
    if (open) {
      credentialsApi
        .list(appId)
        .then(setCredentials)
        .catch(() => {});
    }
  }, [open, appId]);

  useEffect(() => {
    if (editingConnector) {
      form.setFieldsValue({
        apiName: editingConnector.apiName,
        name: editingConnector.name,
        description: editingConnector.description,
        type: editingConnector.type,
        baseUrl: editingConnector.baseUrl,
        credentialId: editingConnector.credentialId,
      });
      setConnectorType(editingConnector.type);
    } else {
      form.resetFields();
      form.setFieldsValue({ type: 'HTTP' });
      setConnectorType('HTTP');
    }
  }, [editingConnector, form, open]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const operations = (values.operations ?? []) as ConnectorOperation[];
      const config: Record<string, unknown> = {};
      if (connectorType === 'HTTP' && operations.length > 0) {
        config.operations = operations;
        if (values.defaultHeaders) config.defaultHeaders = values.defaultHeaders;
        if (values.timeout) config.timeout = values.timeout;
      }
      if (connectorType === 'WEBHOOK') {
        config.allowedMethods = values.allowedMethods ?? ['POST'];
      }

      const data: CreateConnectorRequest = {
        apiName: values.apiName,
        name: values.name,
        description: values.description,
        type: values.type,
        baseUrl: connectorType === 'HTTP' ? values.baseUrl : undefined,
        config,
        credentialId: values.credentialId,
      };

      if (editingConnector) {
        await connectorsApi.update(appId, editingConnector.id, {
          name: data.name,
          description: data.description,
          baseUrl: data.baseUrl,
          config: data.config,
          credentialId: data.credentialId,
        });
        message.success('连接器已更新');
      } else {
        await connectorsApi.create(appId, data);
        message.success('连接器创建成功');
      }
      onSuccess();
      onClose();
    } catch {
      /* 校验错误由 Form 展示 */
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={editingConnector ? '编辑连接器' : '创建连接器'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          label="API 名称"
          name="apiName"
          rules={[
            { required: true, message: '请输入 API 名称' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母、数字、下划线，以字母开头' },
          ]}
        >
          <Input placeholder="weather_api" disabled={!!editingConnector} />
        </Form.Item>
        <Form.Item
          label="显示名称"
          name="name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="天气 API" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="连接器用途说明（可选）" />
        </Form.Item>
        <Form.Item label="连接器类型" name="type" rules={[{ required: true }]}>
          <Select
            options={CONNECTOR_TYPES.map((t) => ({
              value: t.value,
              label: `${t.label} — ${t.desc}`,
            }))}
            onChange={(v: ConnectorType) => setConnectorType(v)}
            disabled={!!editingConnector}
          />
        </Form.Item>

        {connectorType === 'HTTP' && (
          <>
            <Form.Item
              label="基础 URL"
              name="baseUrl"
              rules={[{ required: true, message: '请输入基础 URL' }]}
            >
              <Input placeholder="https://api.example.com" />
            </Form.Item>
            <Form.Item label="关联凭证" name="credentialId">
              <Select
                allowClear
                placeholder="不使用凭证"
                options={credentials.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.type})`,
                }))}
              />
            </Form.Item>
            <Divider>API 操作定义（可选）</Divider>
            <Form.List name="operations">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item name={[name, 'method']} noStyle>
                        <Select
                          style={{ width: 100 }}
                          options={[
                            { value: 'GET', label: 'GET' },
                            { value: 'POST', label: 'POST' },
                            { value: 'PUT', label: 'PUT' },
                            { value: 'PATCH', label: 'PATCH' },
                            { value: 'DELETE', label: 'DELETE' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[name, 'path']}
                        noStyle
                        rules={[{ required: true, message: '路径' }]}
                      >
                        <Input placeholder="/users/{id}" style={{ width: 180 }} />
                      </Form.Item>
                      <Form.Item
                        name={[name, 'name']}
                        noStyle
                        rules={[{ required: true, message: '名称' }]}
                      >
                        <Input placeholder="操作名称" style={{ width: 120 }} />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                      />
                    </Space>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                    添加操作
                  </Button>
                </>
              )}
            </Form.List>
          </>
        )}

        {connectorType === 'WEBHOOK' && (
          <Form.Item label="允许的 HTTP 方法" name="allowedMethods">
            <Select
              mode="multiple"
              defaultValue={['POST']}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'PATCH', label: 'PATCH' },
                { value: 'DELETE', label: 'DELETE' },
              ]}
            />
          </Form.Item>
        )}

        {editingConnector?.webhookToken && (
          <div
            style={{
              background: T.colorFillQuaternary,
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Webhook URL：
            </Text>
            <Text copyable style={{ fontSize: 13 }}>
              {`${window.location.origin}/api/webhooks/${editingConnector.webhookToken}`}
            </Text>
          </div>
        )}
      </Form>
    </Modal>
  );
}
