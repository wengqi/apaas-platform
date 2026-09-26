/**
 * 任务中心 — 表格列定义（从 TaskCenter.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ProcessTask } from '../../api/tasks.js';
import { STATUS_COLORS, STATUS_LABELS } from './constants.js';

/** 构建任务列表列定义（已办页签追加审批结果 / 意见 / 完成时间列）。 */
export function buildColumns(
  activeTab: 'pending' | 'completed',
  onOpenTask: (task: ProcessTask) => void,
): ColumnsType<ProcessTask> {
  return [
    {
      title: '流程名称',
      key: 'processName',
      width: 180,
      render: (_: unknown, record: ProcessTask) =>
        (record as { instance?: { processDef?: { name: string } } }).instance?.processDef?.name ??
        '—',
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
        <Tag color={STATUS_COLORS[status] ?? 'default'}>{STATUS_LABELS[status] ?? status}</Tag>
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
          } as ColumnsType<ProcessTask>[number],
          {
            title: '审批意见',
            dataIndex: 'comment',
            key: 'comment',
            width: 200,
            ellipsis: true,
            render: (v: string) => v ?? '—',
          } as ColumnsType<ProcessTask>[number],
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
          } as ColumnsType<ProcessTask>[number],
        ]
      : []),
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ProcessTask) =>
        activeTab === 'pending' ? (
          <Button type="link" size="small" onClick={() => onOpenTask(record)}>
            处理
          </Button>
        ) : (
          <Button type="link" size="small" onClick={() => onOpenTask(record)}>
            查看
          </Button>
        ),
    },
  ];
}
