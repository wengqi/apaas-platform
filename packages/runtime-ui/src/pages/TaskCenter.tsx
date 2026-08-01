/**
 * 任务中心 — 流程待办任务列表 + 审批处理。
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
  message,
} from 'antd';
import { CheckSquareOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, type ProcessTask } from '../api/tasks';

const { Title, Paragraph } = Typography;

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  DELEGATED: 'blue',
  CANCELLED: 'default',
};

export default function TaskCenter() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<ProcessTask | null>(null);
  const [comment, setComment] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'pending'],
    queryFn: () => tasksApi.list({ status: 'PENDING', page: 1, pageSize: 50 }),
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

  const columns = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
    },
    {
      title: '流程实例',
      dataIndex: 'instanceId',
      key: 'instanceId',
      width: 120,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] ?? 'default'}>{status}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ProcessTask) => (
        <Button type="link" size="small" onClick={() => openTaskModal(record)}>
          处理
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>
          <CheckSquareOutlined /> 任务中心
        </Title>
        <Paragraph type="secondary">
          流程待办任务 — 当前用户的待审批/待处理任务列表
        </Paragraph>
      </Card>

      <Card>
        <Table<ProcessTask>
          columns={columns}
          dataSource={data?.items ?? []}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: '暂无待办任务' }}
        />
      </Card>

      <Modal
        title="处理任务"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={
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
        }
      >
        {selectedTask && (
          <div style={{ marginBottom: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              任务 ID: {selectedTask.id}
            </Paragraph>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              流程实例: {selectedTask.instanceId}
            </Paragraph>
            <Input.TextArea
              placeholder="审批意见（可选）"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
