/**
 * API 密钥管理页（G6 服务身份）——创建（明文一次性展示）/列表/吊销。
 */

import { useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, CopyOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { ServiceIdentityDto } from '@apaas/shared';
import { qk } from '@apaas/shared/stores';
import { openApiAdminApi } from '../api/open-api.js';

const { Text, Paragraph } = Typography;

export default function ApiKeys() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<(ServiceIdentityDto & { apiKey: string }) | null>(null);
  const [form] = Form.useForm();

  const { data: identities = [], isLoading } = useQuery({
    queryKey: qk.serviceIdentities(appId!),
    queryFn: () => openApiAdminApi.listIdentities(appId!),
    enabled: !!appId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.serviceIdentities(appId!) });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => openApiAdminApi.createIdentity(appId!, name),
    onSuccess: (r) => {
      setCreateOpen(false);
      form.resetFields();
      setCreated(r);
      invalidate();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => openApiAdminApi.revokeIdentity(appId!, id),
    onSuccess: () => {
      message.success('已吊销（立即失效）');
      invalidate();
    },
  });

  const columns: ColumnsType<ServiceIdentityDto> = [
    { title: '名称', dataIndex: 'name' },
    {
      title: 'Key 前缀',
      dataIndex: 'keyPrefix',
      render: (v: string) => <Text code>{v}…</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: ServiceIdentityDto['status']) => (
        <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s === 'ACTIVE' ? '启用' : '已吊销'}</Tag>
      ),
    },
    {
      title: '最后使用',
      dataIndex: 'lastUsedAt',
      width: 170,
      render: (v: string | null) => (v ? v.replace('T', ' ').slice(0, 19) : '从未使用'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, r) =>
        r.status === 'ACTIVE' ? (
          <Popconfirm
            title="吊销后立即失效，外部调用将 401。确认？"
            onConfirm={() => revokeMutation.mutate(r.id)}
          >
            <Button type="link" size="small" danger>
              吊销
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  if (!appId) return null;

  return (
    <Card
      title={
        <span>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/app/${appId}/dashboard`)}
            style={{ marginRight: 8 }}
          />
          API 密钥（服务身份）
        </span>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建密钥
        </Button>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        外部系统以请求头 <Text code>X-API-Key</Text> 调用开放触发端点 （
        <Text code>
          POST /api/v1/open/apps/&#123;appId&#125;/processes/&#123;apiName&#125;/start
        </Text>
        ）。 明文密钥仅在创建时展示一次，请立即保存。
      </Paragraph>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={identities}
        loading={isLoading}
        size="small"
        pagination={false}
      />

      <Modal
        title="新建 API 密钥"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="创建"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => createMutation.mutate((v as { name: string }).name.trim())}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：ERP 系统集成" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="密钥已创建"
        open={!!created}
        onCancel={() => setCreated(null)}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => {
              void navigator.clipboard.writeText(created!.apiKey);
              message.success('已复制');
            }}
          >
            复制密钥
          </Button>,
          <Button key="done" type="primary" onClick={() => setCreated(null)}>
            我已保存
          </Button>,
        ]}
      >
        <Paragraph type="warning">请立即保存——此明文密钥不会再次显示：</Paragraph>
        <Paragraph code copyable={{ text: created?.apiKey }}>
          {created?.apiKey}
        </Paragraph>
      </Modal>
    </Card>
  );
}
