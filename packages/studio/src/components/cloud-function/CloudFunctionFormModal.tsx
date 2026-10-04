/**
 * 云函数创建/编辑弹窗 — 基本信息 + Monaco 代码编辑器 + 测试面板。
 */

import { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, Space, Typography, Divider, Tag, message } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { cloudFunctionsApi, type CloudFunction } from '../../api/cloud-functions.js';
import CloudFunctionEditor, { DEFAULT_CODE } from './CloudFunctionEditor.js';

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  editingFn?: CloudFunction | null;
  onClose: () => void;
  onSuccess: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  DISABLED: 'red',
};

export default function CloudFunctionFormModal({ open, editingFn, onClose, onSuccess }: Props) {
  const { appId } = useParams<{ appId: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  // 交互评审（2026-10-04）修复：新建时编辑器此前是空字符串——CloudFunctionEditor
  // 的兜底是 `value ?? DEFAULT_CODE`，空串不是 nullish 不会触发，新手面对全空
  // 编辑器+底部一行签名说明，普遍写出裸 return（isolated-vm 报 Illegal return statement）。
  const [code, setCode] = useState(DEFAULT_CODE);
  const [testInput, setTestInput] = useState('{}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (editingFn) {
      form.setFieldsValue({
        apiName: editingFn.apiName,
        name: editingFn.name,
        description: editingFn.description,
      });
      setCode(editingFn.code.source);
    } else {
      form.resetFields();
      setCode(DEFAULT_CODE);
    }
    setTestResult(null);
    setTestInput('{}');
  }, [editingFn, form, open]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const fnData = {
        name: values.name,
        description: values.description,
        code: { source: code || DEFAULT_CODE, language: 'javascript' as const },
      };

      if (editingFn) {
        await cloudFunctionsApi.update(editingFn.id, fnData);
        message.success('云函数已保存');
      } else {
        await cloudFunctionsApi.create(appId!, {
          ...fnData,
          apiName: values.apiName,
        });
        message.success('云函数创建成功');
      }
      onSuccess();
      onClose();
    } catch {
      /* 校验错误由 Form 展示 */
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!editingFn) {
      message.warning('请先保存云函数后再测试');
      return;
    }

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(testInput);
    } catch {
      message.error('输入参数不是有效的 JSON');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await cloudFunctionsApi.invoke(editingFn.id, { input });
      setTestResult(JSON.stringify(result, null, 2));
    } catch (err) {
      // 交互评审（2026-10-04）：透出后端原因（如"云函数未发布，无法执行"），
      // 此前只显示 "Request failed with status code 400"
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      const reason = axiosErr.response?.data?.error?.message;
      setTestResult(`错误: ${reason ?? (err instanceof Error ? err.message : String(err))}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      title={
        editingFn ? (
          <Space>
            <span>编辑云函数</span>
            {editingFn.status && (
              <Tag color={STATUS_COLORS[editingFn.status]}>{editingFn.status}</Tag>
            )}
            {editingFn.version > 0 && <Text type="secondary">v{editingFn.version}</Text>}
          </Space>
        ) : (
          '创建云函数'
        )
      }
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={loading}
      okText="保存"
      width={900}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          label="API 名称"
          name="apiName"
          rules={[
            { required: true, message: '请输入 API 名称' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母、数字、下划线' },
          ]}
        >
          <Input placeholder="calculate_total" disabled={!!editingFn} />
        </Form.Item>
        <Form.Item
          label="显示名称"
          name="name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="计算总额" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input placeholder="云函数用途说明（可选）" />
        </Form.Item>

        <Divider orientation="left" plain>
          代码
        </Divider>
        <CloudFunctionEditor value={code} onChange={setCode} onSave={handleSave} />
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
          函数签名：{'async function handler(input, context) { ... }'}
          <br />
          context 提供 {'{ log(msg), tenantId, appId }'}，input 为调用方传入的参数对象。
        </Paragraph>

        {editingFn && (
          <>
            <Divider orientation="left" plain>
              测试
            </Divider>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                rows={3}
                placeholder='{"key": "value"}'
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={testing}
                onClick={handleTest}
              >
                执行测试
              </Button>
              {testResult && (
                <pre
                  style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    maxHeight: 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {testResult}
                </pre>
              )}
            </Space>
          </>
        )}
      </Form>
    </Modal>
  );
}
