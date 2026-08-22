/**
 * 凭证创建/编辑表单 — Modal 形式。
 *
 * 支持 Basic Auth / API Key / Bearer Token 三种凭证类型。
 */

import { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import {
  credentialsApi,
  type CredentialType,
  type CreateCredentialRequest,
} from '../../api/connectors.js';

interface CredentialFormModalProps {
  open: boolean;
  appId: string;
  editingCredential?: { id: string; name: string; type: CredentialType } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CREDENTIAL_TYPES: { value: CredentialType; label: string }[] = [
  { value: 'BASIC', label: 'Basic Auth' },
  { value: 'API_KEY', label: 'API Key' },
  { value: 'BEARER', label: 'Bearer Token' },
];

export default function CredentialFormModal({
  open,
  appId,
  editingCredential,
  onClose,
  onSuccess,
}: CredentialFormModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [credType, setCredType] = useState<CredentialType>('BASIC');

  useEffect(() => {
    if (editingCredential) {
      form.setFieldsValue({
        name: editingCredential.name,
        type: editingCredential.type,
      });
      setCredType(editingCredential.type);
    } else {
      form.resetFields();
      form.setFieldsValue({ type: 'BASIC' });
      setCredType('BASIC');
    }
  }, [editingCredential, form, open]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const data: CreateCredentialRequest = {
        name: values.name,
        type: values.type,
        data: {},
      };

      if (values.type === 'BASIC') {
        data.data = { username: values.username, password: values.password };
      } else if (values.type === 'API_KEY') {
        data.data = { headerName: values.headerName, apiKey: values.apiKey };
      } else if (values.type === 'BEARER') {
        data.data = { token: values.token };
      }

      if (editingCredential) {
        await credentialsApi.update(editingCredential.id, { name: values.name, data: data.data });
        message.success('凭证已更新');
      } else {
        await credentialsApi.create(appId, data);
        message.success('凭证创建成功');
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
      title={editingCredential ? '编辑凭证' : '创建凭证'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="生产环境 API Key" />
        </Form.Item>
        <Form.Item label="凭证类型" name="type" rules={[{ required: true }]}>
          <Select
            options={CREDENTIAL_TYPES}
            disabled={!!editingCredential}
            onChange={(v: CredentialType) => setCredType(v)}
          />
        </Form.Item>

        {credType === 'BASIC' && (
          <>
            <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
              <Input placeholder="username" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}>
              <Input.Password placeholder="password" />
            </Form.Item>
          </>
        )}

        {credType === 'API_KEY' && (
          <>
            <Form.Item label="Header 名称" name="headerName" rules={[{ required: true }]}>
              <Input placeholder="X-API-Key" />
            </Form.Item>
            <Form.Item label="API Key" name="apiKey" rules={[{ required: true }]}>
              <Input.Password placeholder="your-api-key" />
            </Form.Item>
          </>
        )}

        {credType === 'BEARER' && (
          <Form.Item label="Token" name="token" rules={[{ required: true }]}>
            <Input.Password placeholder="bearer-token" />
          </Form.Item>
        )}

        {editingCredential && (
          <p style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
            编辑时需重新填写凭证数据（安全考虑，不回显敏感字段）。
          </p>
        )}
      </Form>
    </Modal>
  );
}
