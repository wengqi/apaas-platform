/**
 * 数据集管理页 — 双 Tab：数据流 + 数据集。
 */

import { useState } from 'react';
import { apiErrorMessage } from '../api/client.js';
import {
  Button,
  Card,
  Empty,
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
  PlayCircleOutlined,
  ReloadOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { dataFlowsApi, datasetsApi, type DataFlow, type Dataset } from '../api/datasets.js';
import DataFlowFormModal from '../components/dataset/DataFlowFormModal.js';
import DataFlowCanvas from '../components/dataset/DataFlowCanvas.js';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  EMPTY: 'default',
  REFRESHING: 'processing',
  READY: 'green',
  FAILED: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  EMPTY: '空',
  REFRESHING: '刷新中',
  READY: '就绪',
  FAILED: '失败',
};

export default function DatasetList() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DataFlow | null>(null);
  const [canvasFlow, setCanvasFlow] = useState<DataFlow | null>(null);

  const { data: flows, isLoading: flowsLoading } = useQuery({
    queryKey: ['data-flows', appId],
    queryFn: () => dataFlowsApi.list(appId!),
    enabled: !!appId,
  });

  const { data: datasets } = useQuery({
    queryKey: ['datasets', appId],
    queryFn: () => datasetsApi.list(appId!),
    enabled: !!appId,
  });

  const executeMutation = useMutation({
    mutationFn: (flowId: string) => dataFlowsApi.execute(appId as string, flowId),
    onSuccess: () => {
      message.success('数据流执行已启动，请稍后查看数据集状态');
      queryClient.invalidateQueries({ queryKey: ['datasets', appId] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '执行失败')),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: (flowId: string) => dataFlowsApi.delete(appId as string, flowId),
    onSuccess: () => {
      message.success('数据流已删除');
      queryClient.invalidateQueries({ queryKey: ['data-flows', appId] });
      queryClient.invalidateQueries({ queryKey: ['datasets', appId] });
    },
  });

  const deleteDatasetMutation = useMutation({
    mutationFn: (datasetId: string) => datasetsApi.delete(appId as string, datasetId),
    onSuccess: () => {
      message.success('数据集已删除');
      queryClient.invalidateQueries({ queryKey: ['datasets', appId] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (datasetId: string) => datasetsApi.refresh(appId as string, datasetId),
    onSuccess: () => {
      message.success('数据集刷新已启动');
      queryClient.invalidateQueries({ queryKey: ['datasets', appId] });
    },
  });

  const flowColumns: ColumnsType<DataFlow> = [
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
    { title: '数据源数', key: 'sources', render: (_, r) => r.config.sources?.length ?? 0 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag>{s === 'ACTIVE' ? '启用' : '草稿'}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            loading={executeMutation.isPending}
            onClick={() => executeMutation.mutate(record.id)}
          >
            执行
          </Button>
          <Button size="small" icon={<ApartmentOutlined />} onClick={() => setCanvasFlow(record)} />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              setFormOpen(true);
            }}
          />
          <Popconfirm
            title="确定删除此数据流？关联的数据集也会删除"
            onConfirm={() => deleteFlowMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const datasetColumns: ColumnsType<Dataset> = [
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s] ?? s}</Tag>,
    },
    { title: '行数', dataIndex: 'rowCount', key: 'rowCount' },
    { title: '列数', key: 'columns', render: (_, r) => r.columns?.length ?? 0 },
    {
      title: '最后刷新',
      dataIndex: 'lastRefreshedAt',
      key: 'lastRefreshedAt',
      render: (t: string) =>
        t ? new Date(t).toLocaleString('zh-CN') : <Text type="secondary">—</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={refreshMutation.isPending}
            disabled={record.status === 'REFRESHING'}
            onClick={() => refreshMutation.mutate(record.id)}
          >
            刷新
          </Button>
          <Popconfirm
            title="确定删除此数据集？"
            onConfirm={() => deleteDatasetMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>数据集</Title>
      <Text type="secondary">通过数据流生成物化数据集，用于页面表格和图表</Text>

      <Tabs
        defaultActiveKey="flows"
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'flows',
            label: '数据流',
            children: (
              <Card>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">{flows?.length ?? 0} 个数据流</Text>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    创建数据流
                  </Button>
                </div>
                <Table
                  columns={flowColumns}
                  dataSource={flows ?? []}
                  rowKey="id"
                  loading={flowsLoading}
                  locale={{ emptyText: <Empty description="暂无数据流" /> }}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: 'datasets',
            label: '数据集',
            children: (
              <Card>
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">{datasets?.length ?? 0} 个数据集</Text>
                </div>
                <Table
                  columns={datasetColumns}
                  dataSource={datasets ?? []}
                  rowKey="id"
                  locale={{ emptyText: <Empty description="暂无数据集（执行数据流后生成）" /> }}
                  pagination={false}
                />
              </Card>
            ),
          },
        ]}
      />

      <DataFlowFormModal
        open={formOpen}
        editingFlow={editing}
        onClose={() => setFormOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['data-flows', appId] })}
      />

      {canvasFlow && <DataFlowCanvas flow={canvasFlow} onClose={() => setCanvasFlow(null)} />}
    </div>
  );
}
