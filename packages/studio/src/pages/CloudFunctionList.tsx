/**
 * 云函数列表页 — 表格 + 状态标签 + 操作按钮（编辑/发布/删除/测试）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useState } from 'react';
import { Button, Card, Space, Table, Tag, Typography, message, Popconfirm } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { cloudFunctionsApi, type CloudFunction } from '../api/cloud-functions.js';
import CloudFunctionFormModal from '../components/cloud-function/CloudFunctionFormModal.js';

const { Title } = Typography;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  DISABLED: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  DISABLED: '已禁用',
};

export default function CloudFunctionList() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFn, setEditingFn] = useState<CloudFunction | null>(null);

  const { data: functions, isLoading } = useQuery({
    queryKey: ['cloud-functions', appId],
    queryFn: () => cloudFunctionsApi.list(appId!),
    enabled: !!appId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cloudFunctionsApi.delete(appId as string, id),
    onSuccess: () => {
      message.success('云函数已删除');
      queryClient.invalidateQueries({ queryKey: ['cloud-functions', appId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => cloudFunctionsApi.publish(appId as string, id),
    onSuccess: () => {
      message.success('云函数已发布');
      queryClient.invalidateQueries({ queryKey: ['cloud-functions', appId] });
    },
  });

  const handleCreate = () => {
    setEditingFn(null);
    setModalOpen(true);
  };

  const handleEdit = (fn: CloudFunction) => {
    setEditingFn(fn);
    setModalOpen(true);
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: CloudFunction) => (
        <Space size={6} style={{ whiteSpace: 'nowrap' }}>
          <CloudOutlined style={{ color: T.colorPrimary, flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>{name}</span>
          <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, flexShrink: 0 }}>
            ({record.apiName})
          </span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status] ?? status}</Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (v: number) => (v > 0 ? `v${v}` : '-'),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: CloudFunction) => (
        <Space size={4} style={{ whiteSpace: 'nowrap' }}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.status !== 'PUBLISHED' && (
            <Button
              type="text"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => publishMutation.mutate(record.id)}
            >
              发布
            </Button>
          )}
          <Popconfirm
            title="删除云函数"
            description={`确定删除「${record.name}」吗？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            云函数
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建云函数
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={functions ?? []}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <CloudFunctionFormModal
        open={modalOpen}
        editingFn={editingFn}
        onClose={() => setModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['cloud-functions', appId] })}
      />
    </div>
  );
}
