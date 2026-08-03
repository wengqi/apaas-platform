/**
 * 任务中心 — 流程待办/已办任务列表 + 审批处理（含表单数据展示）。
 */

import { useState } from 'react';
import {
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Modal,
  Input,
  Space,
  Tabs,
  Descriptions,
  Spin,
  message,
} from 'antd';
import { CheckSquareOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, type ProcessTask } from '../api/tasks';

const { Title, Paragraph, Text } = Typography;

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  DELEGATED: 'blue',
  CANCELLED: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  DELEGATED: '已转办',
  CANCELLED: '已取消',
};

export default function TaskCenter() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [selectedTask, setSelectedTask] = useState<ProcessTask | null>(null);
  const [comment, setComment] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // 待办列表
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['tasks', 'pending'],
    queryFn: () => tasksApi.list({ status: 'pending', page: 1, pageSize: 50 }),
  });

  // 已办列表
  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['tasks', 'completed'],
    queryFn: () => tasksApi.list({ status: 'completed', page: 1, pageSize: 50 }),
  });

  // 任务详情（审批时加载完整信息含流程变量）
  const { data: taskDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['task', selectedTask?.id],
    queryFn: () => tasksApi.get(selectedTask!.id),
    enabled: !!selectedTask?.id,
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, decision }: { taskId: string; decision: string }) =>
      tasksApi.complete(taskId, { decision, comment }),
    onSuccess: () => {
      message.success('任务已处理');
      setModalOpen(false);
      setComment('');
      setSelectedTask(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: unknown) => {
      message.error(`处理失败: ${(err as Error).message}`);
    },
  });

  const openTaskModal = (task: ProcessTask) => {
    setSelectedTask(task);
    setComment('');
    setModalOpen(true);
  };

  const handleComplete = (decision: string) => {
    if (!selectedTask) return;
    completeMutation.mutate({ taskId: selectedTask.id, decision });
  };

  // 提取流程变量中的表单数据
  const variables = taskDetail?.instance?.variables;
  const triggerContext = taskDetail?.instance?.triggerContext;
  const formData = variables
    ? Object.entries(variables).filter(
        ([key]) => key !== 'global' && !key.startsWith('_'),
      )
    : [];
  const triggerData = triggerContext
    ? Object.entries(triggerContext).filter(
        ([key]) => key !== 'global' && !key.startsWith('_'),
      )
    : [];

  const columns = [
    {
      title: '流程名称',
      key: 'processName',
      width: 180,
      render: (_: unknown, record: ProcessTask) =>
        (record as { instance?: { processDef?: { name: string } } }).instance?.processDef?.name ?? '—',
    },
    {
      title: '任务',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 140,
      render: (v: string) => v ?? '审批任务',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] ?? 'default'}>
          {STATUS_LABELS[status] ?? status}
        </Tag>
      ),
    },
    ...(activeTab === 'completed'
      ? [
          {
            title: '审批结果',
            dataIndex: 'decision',
            key: 'decision',
            width: 100,
            render: (v: string) =>
              v ? (
                <Tag color={v === 'APPROVED' ? 'green' : 'red'}>
                  {v === 'APPROVED' ? '批准' : '拒绝'}
                </Tag>
              ) : (
                '—'
              ),
          },
          {
            title: '审批意见',
            dataIndex: 'comment',
            key: 'comment',
            width: 200,
            ellipsis: true,
            render: (v: string) => v ?? '—',
          },
        ]
      : []),
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    ...(activeTab === 'completed'
      ? [
          {
            title: '完成时间',
            dataIndex: 'completedAt',
            key: 'completedAt',
            width: 180,
            render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
          },
        ]
      : []),
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ProcessTask) =>
        activeTab === 'pending' ? (
          <Button type="link" size="small" onClick={() => openTaskModal(record)}>
            处理
          </Button>
        ) : (
          <Button type="link" size="small" onClick={() => openTaskModal(record)}>
            查看
          </Button>
        ),
    },
  ];

  const currentData = activeTab === 'pending' ? pendingData : completedData;
  const currentLoading = activeTab === 'pending' ? pendingLoading : completedLoading;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>
          <CheckSquareOutlined /> 任务中心
        </Title>
        <Paragraph type="secondary">
          流程待办任务 — 当前用户的待审批/已处理任务列表
        </Paragraph>
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'pending' | 'completed')}
          items={[
            {
              key: 'pending',
              label: `待办 (${pendingData?.total ?? 0})`,
              children: (
                <Table<ProcessTask>
                  columns={columns}
                  dataSource={currentData?.items ?? []}
                  rowKey="id"
                  loading={currentLoading}
                  pagination={false}
                  locale={{ emptyText: '暂无待办任务' }}
                />
              ),
            },
            {
              key: 'completed',
              label: `已办 (${completedData?.total ?? 0})`,
              children: (
                <Table<ProcessTask>
                  columns={columns}
                  dataSource={currentData?.items ?? []}
                  rowKey="id"
                  loading={currentLoading}
                  pagination={false}
                  locale={{ emptyText: '暂无已办任务' }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={
          activeTab === 'pending'
            ? '处理审批任务'
            : '任务详情'
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={640}
        footer={
          activeTab === 'pending' ? (
            <Space>
              <Button
                danger
                icon={<CloseOutlined />}
                loading={completeMutation.isPending}
                onClick={() => handleComplete('REJECTED')}
              >
                拒绝
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={completeMutation.isPending}
                onClick={() => handleComplete('APPROVED')}
              >
                批准
              </Button>
            </Space>
          ) : (
            <Button onClick={() => setModalOpen(false)}>关闭</Button>
          )
        }
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          selectedTask && taskDetail && (
            <div>
              <Descriptions
                column={2}
                size="small"
                bordered
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item label="流程名称" span={2}>
                  {taskDetail.instance?.processDef?.name ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label="任务 ID">
                  {taskDetail.id}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={STATUS_COLORS[taskDetail.status] ?? 'default'}>
                    {STATUS_LABELS[taskDetail.status] ?? taskDetail.status}
                  </Tag>
                </Descriptions.Item>
                {taskDetail.decision && (
                  <Descriptions.Item label="审批结果">
                    <Tag color={taskDetail.decision === 'APPROVED' ? 'green' : 'red'}>
                      {taskDetail.decision === 'APPROVED' ? '批准' : '拒绝'}
                    </Tag>
                  </Descriptions.Item>
                )}
                {taskDetail.comment && (
                  <Descriptions.Item label="审批意见">
                    {taskDetail.comment}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="创建时间">
                  {new Date(taskDetail.createdAt).toLocaleString('zh-CN')}
                </Descriptions.Item>
                {taskDetail.completedAt && (
                  <Descriptions.Item label="完成时间">
                    {new Date(taskDetail.completedAt).toLocaleString('zh-CN')}
                  </Descriptions.Item>
                )}
              </Descriptions>

              {/* 申请表单数据 */}
              {triggerData.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    申请内容
                  </Text>
                  <Descriptions column={1} size="small" bordered>
                    {triggerData.map(([key, value]) => (
                      <Descriptions.Item key={key} label={key}>
                        {typeof value === 'object'
                          ? JSON.stringify(value, null, 2)
                          : String(value ?? '—')}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </div>
              )}

              {/* 流程变量 */}
              {formData.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    流程变量
                  </Text>
                  <Descriptions column={1} size="small" bordered>
                    {formData.map(([key, value]) => (
                      <Descriptions.Item key={key} label={key}>
                        {typeof value === 'object'
                          ? JSON.stringify(value, null, 2)
                          : String(value ?? '—')}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </div>
              )}

              {/* 审批意见输入（仅待办时显示） */}
              {activeTab === 'pending' && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    审批意见
                  </Text>
                  <Input.TextArea
                    placeholder="请输入审批意见（可选）"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              )}
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
