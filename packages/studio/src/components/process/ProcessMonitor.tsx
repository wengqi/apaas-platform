/**
 * 流程监控 —— 对齐 DESIGN-process.md §8。
 *
 * 三部分:
 *  - 运行实例列表(流程名/状态/触发者/开始时间/耗时)
 *  - 实例详情:节点执行状态(简化画布只读 + 状态颜色标记)
 *  - 人工任务列表(待审批/已审批) + 任务处理面板(审批/驳回/转办)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  processesApi,
  type ProcessInstance,
  type UserTask,
  type ProcessInstanceReport,
} from '../../api/processes.js';
import {
  getInstanceStateMeta,
  getNodeStateMeta,
  getNodeMeta,
  INSTANCE_STATE_META,
} from '../../constants/process.js';

const { Text, Title, Paragraph } = Typography;

/** 耗时格式化。 */
function formatDuration(start: string, end?: string): string {
  const startMs = dayjs(start).valueOf();
  const endMs = end ? dayjs(end).valueOf() : Date.now();
  const diff = Math.max(0, endMs - startMs);
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

export default function ProcessMonitor() {
  const { appId } = useParams<{ appId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const processId = searchParams.get('processId') ?? undefined;
  const [activeTab, setActiveTab] = useState<'instances' | 'tasks'>('instances');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');
  const [taskModal, setTaskModal] = useState<UserTask | null>(null);

  const queryClient = useQueryClient();

  /** 流程列表(用于筛选下拉 + 名称映射)。 */
  const { data: processes } = useQuery({
    queryKey: ['processes', appId],
    queryFn: () => processesApi.list(appId as string),
    enabled: !!appId,
  });

  const processNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of processes ?? []) {
      m.set(p.id, p.name);
    }
    return m;
  }, [processes]);

  /** 实例列表(轮询运行中实例)。 */
  const { data: instances, isLoading } = useQuery({
    queryKey: ['process-instances', processId, stateFilter],
    queryFn: () =>
      processesApi.listInstances(processId as string, {
        state: stateFilter as never,
      }),
    enabled: !!processId,
    refetchInterval: 5000,
  });

  /** 任务列表。 */
  const { data: tasks } = useQuery({
    queryKey: ['process-tasks', taskTab, processId],
    queryFn: () =>
      processesApi.listTasks({
        status: taskTab,
        processDefId: processId,
      }),
    enabled: activeTab === 'tasks' && !!processId,
  });

  /** 实例详情。 */
  const { data: instanceReport } = useQuery({
    queryKey: ['process-instance', selectedInstanceId],
    queryFn: () => processesApi.getInstance(selectedInstanceId as string),
    enabled: !!selectedInstanceId,
    refetchInterval: 5000,
  });

  /** 完成任务 mutation。 */
  const completeTaskMutation = useMutation({
    mutationFn: (params: { taskId: string; decision: 'approve' | 'reject'; comment?: string }) =>
      processesApi.completeTask(params.taskId, params.decision, params.comment),
    onSuccess: () => {
      message.success('任务已处理');
      setTaskModal(null);
      void queryClient.invalidateQueries({ queryKey: ['process-tasks'] });
    },
    onError: () => message.error('处理失败'),
  });

  /** 转办任务 mutation。 */
  const delegateMutation = useMutation({
    mutationFn: (params: { taskId: string; delegatedTo: string }) =>
      processesApi.delegateTask(params.taskId, params.delegatedTo),
    onSuccess: () => {
      message.success('任务已转办');
      setTaskModal(null);
      void queryClient.invalidateQueries({ queryKey: ['process-tasks'] });
    },
    onError: () => message.error('转办失败'),
  });

  const instanceColumns: ColumnsType<ProcessInstance> = [
    {
      title: '流程名',
      dataIndex: 'processKey',
      render: (_, r) => processNameMap.get(r.processDefId) ?? r.processKey,
    },
    {
      title: '状态',
      dataIndex: 'state',
      render: (state: string) => {
        const meta = getInstanceStateMeta(state);
        return (
          <Badge status={meta.badgeStatus} text={meta.label} />
        );
      },
    },
    { title: '触发者', dataIndex: 'triggeredByUser', render: (v) => v ?? '系统' },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '耗时',
      render: (_, r) => formatDuration(r.startTime, r.endTime),
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            type="link"
            onClick={() => setSelectedInstanceId(r.id)}
          >
            详情
          </Button>
          {r.state === 'waiting' && (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setActiveTab('tasks');
                setTaskTab('pending');
              }}
            >
              处理
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const taskColumns: ColumnsType<UserTask> = [
    { title: '任务名称', dataIndex: 'taskName' },
    {
      title: '流程',
      dataIndex: 'processDefId',
      render: (v) => processNameMap.get(v) ?? v,
    },
    { title: '发起人', dataIndex: 'starter', render: (v) => v ?? '—' },
    {
      title: '到达时间',
      dataIndex: 'arrivedAt',
      render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm') : '—'),
    },
    {
      title: '截止',
      dataIndex: 'dueAt',
      render: (v?: string) => {
        if (!v) return '—';
        const overdue = dayjs(v).valueOf() < Date.now();
        return (
          <Text type={overdue ? 'danger' : undefined}>
            {overdue ? '已超时' : `${dayjs(v).format('MM-DD HH:mm')}`}
          </Text>
        );
      },
    },
    ...(taskTab === 'completed'
      ? [
          {
            title: '审批结果',
            dataIndex: 'decision',
            render: (v?: string) =>
              v ? (
                <Tag color={v === 'approve' ? 'green' : 'red'}>
                  {v === 'approve' ? '通过' : '驳回'}
                </Tag>
              ) : (
                '—'
              ),
          } as ColumnsType<UserTask>[number],
          {
            title: '审批时间',
            dataIndex: 'completedAt',
            render: (v?: string) => (v ? dayjs(v).format('MM-DD HH:mm') : '—'),
          } as ColumnsType<UserTask>[number],
        ]
      : []),
    {
      title: '操作',
      render: (_, r) => (
        <Button size="small" type="link" onClick={() => setTaskModal(r)}>
          处理
        </Button>
      ),
    },
  ];

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', background: '#f5f7fa' }}>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'instances' | 'tasks')}
        style={{ padding: '0 24px', background: '#fff' }}
        items={[
          {
            key: 'instances',
            label: '运行实例',
            children: (
              <InstanceListTab
                instances={instances ?? []}
                isLoading={isLoading}
                columns={instanceColumns}
                stateFilter={stateFilter}
                setStateFilter={setStateFilter}
                processes={processes ?? []}
                processId={processId}
                onProcessChange={(v) =>
                  setSearchParams(v ? { processId: v } : {})
                }
              />
            ),
          },
          {
            key: 'tasks',
            label: '人工任务',
            children: (
              <Tabs
                activeKey={taskTab}
                onChange={(k) => setTaskTab(k as 'pending' | 'completed')}
                items={[
                  {
                    key: 'pending',
                    label: `待审批 (${tasks?.length ?? 0})`,
                    children: (
                      <Table
                        size="middle"
                        rowKey="id"
                        columns={taskColumns}
                        dataSource={tasks ?? []}
                        pagination={{ pageSize: 10 }}
                      />
                    ),
                  },
                  {
                    key: 'completed',
                    label: '已审批',
                    children: (
                      <Table
                        size="middle"
                        rowKey="id"
                        columns={taskColumns}
                        dataSource={tasks ?? []}
                        pagination={{ pageSize: 10 }}
                      />
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      {/* 实例详情 Modal */}
      <Modal
        title="实例详情"
        open={!!selectedInstanceId}
        onCancel={() => setSelectedInstanceId(null)}
        footer={null}
        width={900}
      >
        {instanceReport && (
          <InstanceDetail report={instanceReport} processName={processNameMap.get(instanceReport.instance.processDefId)} />
        )}
      </Modal>

      {/* 任务处理面板 */}
      <TaskProcessPanel
        task={taskModal}
        onClose={() => setTaskModal(null)}
        onComplete={(decision, comment) =>
          taskModal &&
          completeTaskMutation.mutate({
            taskId: taskModal.id,
            decision,
            comment,
          })
        }
        onDelegate={(userId) =>
          taskModal &&
          delegateMutation.mutate({
            taskId: taskModal.id,
            delegatedTo: userId,
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 实例列表 Tab
// ---------------------------------------------------------------------------

interface InstanceListTabProps {
  instances: ProcessInstance[];
  isLoading: boolean;
  columns: ColumnsType<ProcessInstance>;
  stateFilter?: string;
  setStateFilter: (v?: string) => void;
  processes: { id: string; name: string }[];
  processId?: string;
  onProcessChange: (v?: string) => void;
}

function InstanceListTab({
  instances,
  isLoading,
  columns,
  stateFilter,
  setStateFilter,
  processes,
  processId,
  onProcessChange,
}: InstanceListTabProps) {
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 140 }}
          value={stateFilter}
          onChange={(v) => setStateFilter(v)}
          options={Object.entries(INSTANCE_STATE_META).map(([k, v]) => ({
            label: v.label,
            value: k,
          }))}
        />
        <Select
          placeholder="流程筛选"
          allowClear
          showSearch
          style={{ width: 200 }}
          value={processId}
          onChange={(v) => onProcessChange(v)}
          options={processes.map((p) => ({ label: p.name, value: p.id }))}
        />
      </Space>
      <Table
        size="middle"
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={instances}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="暂无运行实例" /> }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 实例详情:节点执行状态
// ---------------------------------------------------------------------------

function InstanceDetail({
  report,
  processName,
}: {
  report: ProcessInstanceReport;
  processName?: string;
}) {
  const { instance, nodes } = report;
  const stateMeta = getInstanceStateMeta(instance.state);

  return (
    <div>
      <Descriptions
        size="small"
        column={2}
        bordered
        style={{ marginBottom: 16 }}
        items={[
          { label: '流程', children: processName ?? instance.processKey },
          { label: '状态', children: <Badge status={stateMeta.badgeStatus} text={stateMeta.label} /> },
          { label: '触发者', children: instance.triggeredByUser ?? '系统' },
          { label: '开始时间', children: dayjs(instance.startTime).format('YYYY-MM-DD HH:mm:ss') },
          { label: '耗时', children: formatDuration(instance.startTime, instance.endTime) },
          { label: '实例 ID', children: <Text code>{instance.id}</Text> },
        ]}
      />
      {instance.error && (
        <Paragraph type="danger" style={{ marginBottom: 16 }}>
          错误: {instance.error}
        </Paragraph>
      )}
      <Title level={5}>节点执行状态</Title>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(nodes).map(([nodeId, exec]) => {
          const meta = getNodeStateMeta(exec.state);
          return (
            <div
              key={nodeId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                border: `1px solid ${meta.color}`,
                borderLeft: `4px solid ${meta.color}`,
                borderRadius: 6,
                background: exec.state === 'idle' ? '#fafbfc' : '#fff',
              }}
            >
              <Badge status={meta.badgeStatus} />
              <Text strong style={{ fontSize: 13 }}>
                {nodeId}
              </Text>
              <Tag style={{ marginLeft: 'auto' }}>{meta.label}</Tag>
              {exec.startTime && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(exec.startTime).format('HH:mm:ss')}
                </Text>
              )}
              {exec.error && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  {exec.error}
                </Text>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 任务处理面板(审批/驳回/转办)
// ---------------------------------------------------------------------------

interface TaskProcessPanelProps {
  task: UserTask | null;
  onClose: () => void;
  onComplete: (decision: 'approve' | 'reject', comment?: string) => void;
  onDelegate: (userId: string, comment?: string) => void;
}

function TaskProcessPanel({
  task,
  onClose,
  onComplete,
  onDelegate,
}: TaskProcessPanelProps) {
  const [form] = Form.useForm();
  const [delegateMode, setDelegateMode] = useState(false);

  useEffect(() => {
    if (task) {
      form.resetFields();
      setDelegateMode(false);
    }
  }, [task, form]);

  const handleApprove = () => {
    const comment = form.getFieldValue('comment') as string | undefined;
    onComplete('approve', comment);
  };

  const handleReject = () => {
    const comment = form.getFieldValue('comment') as string | undefined;
    onComplete('reject', comment);
  };

  const handleDelegate = () => {
    void form.validateFields().then((values) => {
      onDelegate(values.delegateUserId as string, values.comment as string | undefined);
    });
  };

  return (
    <Modal
      title={task ? `处理任务: ${task.taskName}` : '处理任务'}
      open={!!task}
      onCancel={onClose}
      footer={
        task ? (
          <Space>
            <Popconfirm
              title="驳回任务"
              description="确定驳回此任务吗?"
              okButtonProps={{ danger: true }}
              onConfirm={handleReject}
            >
              <Button danger>驳回</Button>
            </Popconfirm>
            {delegateMode ? (
              <Button onClick={handleDelegate}>确认转办</Button>
            ) : (
              <Button onClick={() => setDelegateMode(true)}>转办</Button>
            )}
            <Button type="primary" onClick={handleApprove}>
              通过
            </Button>
          </Space>
        ) : null
      }
      width={640}
    >
      {task && (
        <Form form={form} layout="vertical">
          <Descriptions
            size="small"
            column={2}
            style={{ marginBottom: 16 }}
            items={[
              { label: '流程', children: task.processName ?? '—' },
              { label: '发起人', children: task.starter ?? '—' },
              { label: '到达时间', children: task.arrivedAt ? dayjs(task.arrivedAt).format('MM-DD HH:mm') : '—' },
              { label: '截止', children: task.dueAt ? dayjs(task.dueAt).format('MM-DD HH:mm') : '—' },
            ]}
          />
          {task.variables && Object.keys(task.variables).length > 0 && (
            <Card size="small" title="申请内容" style={{ marginBottom: 16 }}>
              <Descriptions size="small" column={1} items={Object.entries(task.variables).map(([k, v]) => ({ label: k, children: String(v) }))} />
            </Card>
          )}
          <Form.Item label="审批意见" name="comment">
            <Input.TextArea rows={3} placeholder="请输入审批意见(驳回时建议必填)" />
          </Form.Item>
          {delegateMode && (
            <Form.Item
              label="转办给"
              name="delegateUserId"
              rules={[{ required: true, message: '请输入转办用户 ID' }]}
            >
              <Input placeholder="输入转办用户 ID" />
            </Form.Item>
          )}
        </Form>
      )}
    </Modal>
  );
}
