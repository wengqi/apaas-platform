/**
 * 从 components/process/ProcessMonitor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 运行实例列表 / 人工任务列表的表格列定义。
 */

import { Badge, Button, Popconfirm, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { ProcessInstance, UserTask } from '../../../api/processes.js';
import { displayName } from '../../../utils/user-display.js';
import { getInstanceStateMeta } from '../../../constants/process.js';
import { formatDuration } from './formatDuration.js';

const { Text } = Typography;

/** 运行实例表格列。 */
export function buildInstanceColumns(params: {
  processNameMap: Map<string, string>;
  /** 双视角评审（2026-10-04）R10：触发者显示姓名而非裸 cuid */
  userNameMap: Map<string, string>;
  onSelectInstance: (instanceId: string) => void;
  onHandleTask: () => void;
  onCancelInstance: (instanceId: string) => void;
}): ColumnsType<ProcessInstance> {
  const { processNameMap, userNameMap, onSelectInstance, onHandleTask, onCancelInstance } = params;

  return [
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
        return <Badge status={meta.badgeStatus} text={meta.label} />;
      },
    },
    {
      title: '触发者',
      dataIndex: 'triggeredByUser',
      render: (v) => (v ? displayName(userNameMap, v) : '系统'),
    },
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
          <Button size="small" type="link" onClick={() => onSelectInstance(r.id)}>
            详情
          </Button>
          {r.state === 'WAITING_USER_TASK' && (
            <Button size="small" type="link" onClick={onHandleTask}>
              处理
            </Button>
          )}
          {(r.state === 'RUNNING' || r.state === 'WAITING_USER_TASK') && (
            <Popconfirm
              title="确认终止"
              description="终止后所有待办任务将被取消，不可恢复。"
              okText="终止"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onCancelInstance(r.id)}
            >
              <Button size="small" type="link" danger>
                终止
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];
}

/** 人工任务表格列。 */
export function buildTaskColumns(params: {
  processNameMap: Map<string, string>;
  /** 双视角评审（2026-10-04）R10：发起人显示姓名而非裸 cuid */
  userNameMap: Map<string, string>;
  taskTab: 'pending' | 'completed';
  onProcessTask: (task: UserTask) => void;
}): ColumnsType<UserTask> {
  const { processNameMap, userNameMap, taskTab, onProcessTask } = params;

  return [
    { title: '任务名称', dataIndex: 'taskName' },
    {
      title: '流程',
      dataIndex: 'processDefId',
      render: (v) => processNameMap.get(v) ?? v,
    },
    {
      title: '发起人',
      dataIndex: 'starter',
      render: (v) => (v ? displayName(userNameMap, v) : '—'),
    },
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
        <Button size="small" type="link" onClick={() => onProcessTask(r)}>
          处理
        </Button>
      ),
    },
  ];
}
