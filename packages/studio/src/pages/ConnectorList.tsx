/**
 * 连接器管理页 — 列表 + 创建/编辑/删除 + 凭证管理 + 调试面板。
 */

import { useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  connectorsApi,
  credentialsApi,
  type Connector,
  type ConnectorCredential,
  type CredentialType,
} from '../api/connectors.js';
import ConnectorFormModal from '../components/connector/ConnectorFormModal.js';
import ConnectorTestPanel from '../components/connector/ConnectorTestPanel.js';
import CredentialFormModal from '../components/connector/CredentialFormModal.js';

const { Title, Text } = Typography;

const TYPE_COLOR: Record<string, string> = { HTTP: 'blue', WEBHOOK: 'purple' };
const TYPE_LABEL: Record<string, string> = { HTTP: 'HTTP', WEBHOOK: 'Webhook' };
const CRED_LABEL: Record<string, string> = {
  BASIC: 'Basic Auth',
  API_KEY: 'API Key',
  BEARER: 'Bearer',
};

export default function ConnectorList() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | null>(null);
  const [testing, setTesting] = useState<Connector | null>(null);
  const [credFormOpen, setCredFormOpen] = useState(false);
  const [editingCred, setEditingCred] = useState<{
    id: string;
    name: string;
    type: CredentialType;
  } | null>(null);

  const { data: connectors, isLoading } = useQuery({
    queryKey: ['connectors', appId],
    queryFn: () => connectorsApi.list(appId!),
    enabled: !!appId,
  });

  const { data: credentials } = useQuery({
    queryKey: ['credentials', appId],
    queryFn: () => credentialsApi.list(appId!),
    enabled: !!appId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectorsApi.delete(id),
    onSuccess: () => {
      message.success('连接器已删除');
      queryClient.invalidateQueries({ queryKey: ['connectors', appId] });
    },
    onError: () => message.error('删除失败'),
  });

  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => credentialsApi.delete(id),
    onSuccess: () => {
      message.success('凭证已删除');
      queryClient.invalidateQueries({ queryKey: ['credentials', appId] });
    },
    onError: () => message.error('删除失败'),
  });

  const connectorColumns: ColumnsType<Connector> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.apiName}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color={TYPE_COLOR[type]}>{TYPE_LABEL[type] ?? type}</Tag>,
    },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      ellipsis: true,
      render: (url: string) => url || <Text type="secondary">—</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>
          {status === 'ACTIVE' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<ExperimentOutlined />}
            disabled={record.type !== 'HTTP'}
            onClick={() => setTesting(record)}
          >
            测试
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              setFormOpen(true);
            }}
          />
          <Popconfirm title="确定删除此连接器？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const credColumns: ColumnsType<ConnectorCredential> = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag>{CRED_LABEL[type] ?? type}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingCred({ id: record.id, name: record.name, type: record.type });
              setCredFormOpen(true);
            }}
          />
          <Popconfirm
            title="确定删除此凭证？"
            onConfirm={() => deleteCredMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>连接器</Title>
      <Text type="secondary">管理外部 API 调用配置和凭证</Text>

      <Tabs
        defaultActiveKey="connectors"
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'connectors',
            label: '连接器',
            children: (
              <Card>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">{connectors?.length ?? 0} 个连接器</Text>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    创建连接器
                  </Button>
                </div>
                <Table
                  columns={connectorColumns}
                  dataSource={connectors ?? []}
                  rowKey="id"
                  loading={isLoading}
                  locale={{ emptyText: <Empty description="暂无连接器" /> }}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: 'credentials',
            label: '凭证',
            children: (
              <Card>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">{credentials?.length ?? 0} 个凭证</Text>
                  <Button
                    icon={<KeyOutlined />}
                    onClick={() => {
                      setEditingCred(null);
                      setCredFormOpen(true);
                    }}
                  >
                    创建凭证
                  </Button>
                </div>
                <Table
                  columns={credColumns}
                  dataSource={credentials ?? []}
                  rowKey="id"
                  locale={{ emptyText: <Empty description="暂无凭证" /> }}
                  pagination={false}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* 连接器创建/编辑弹窗 */}
      <ConnectorFormModal
        open={formOpen}
        appId={appId!}
        editingConnector={editing}
        onClose={() => setFormOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['connectors', appId] })}
      />

      {/* 凭证创建/编辑弹窗 */}
      <CredentialFormModal
        open={credFormOpen}
        appId={appId!}
        editingCredential={editingCred}
        onClose={() => setCredFormOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['credentials', appId] })}
      />

      {/* 测试面板 Drawer */}
      <Modal
        title={`测试连接器 — ${testing?.name ?? ''}`}
        open={!!testing}
        onCancel={() => setTesting(null)}
        footer={null}
        width={640}
      >
        {testing && <ConnectorTestPanel connector={testing} />}
      </Modal>
    </div>
  );
}
