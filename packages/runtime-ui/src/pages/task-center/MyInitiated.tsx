/**
 * 任务中心 — 「我发起的」页签（2026-10-10）。
 * 申请人视角查看自己发起的流程实例与审批进度（对标飞书 aPaaS「我发起的」）：
 * 提交申请后不再"提交即失联"，可随时查看当前状态与完整流程轨迹。
 * 数据源 = GET /instances/mine（后端按 triggerContext.triggeredByUser 过滤发起人本人）。
 */

import { useState } from 'react';
import { Button, Descriptions, Modal, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { tasksApi, type MyInstance } from '../../api/tasks.js';
import TraceViewer from '../../components/TraceViewer.js';
import { INSTANCE_STATUS_COLORS, INSTANCE_STATUS_LABELS } from './constants.js';
import { ListErrorAlert } from './ListErrorAlert.js';
import { extractRecordTitle } from './utils.js';

export default function MyInitiated() {
  const [selected, setSelected] = useState<MyInstance | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['instances', 'mine'],
    queryFn: () => tasksApi.listMyInstances({ page: 1, pageSize: 50 }),
  });

  // API 返回 data 为数组，防御非数组形态
  const items = Array.isArray(data) ? data : [];

  const instanceId = selected?.id;
  const { data: traceData, isLoading: traceLoading } = useQuery({
    queryKey: ['trace', instanceId],
    queryFn: () => tasksApi.getTrace(instanceId!),
    enabled: !!instanceId,
  });

  const columns: ColumnsType<MyInstance> = [
    {
      title: '流程名称',
      key: 'processName',
      width: 180,
      render: (_: unknown, r: MyInstance) => r.processDef?.name ?? '—',
    },
    {
      title: '申请内容',
      key: 'title',
      ellipsis: true,
      render: (_: unknown, r: MyInstance) => extractRecordTitle(r.triggerContext) ?? '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={INSTANCE_STATUS_COLORS[status] ?? 'default'}>
          {INSTANCE_STATUS_LABELS[status] ?? status}
        </Tag>
      ),
    },
    {
      title: '发起时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, r: MyInstance) => (
        <Button type="link" size="small" onClick={() => setSelected(r)}>
          进度
        </Button>
      ),
    },
  ];

  return (
    <div>
      {isError ? (
        <ListErrorAlert error={error} onRetry={() => refetch()} />
      ) : (
        <Table<MyInstance>
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: '暂无发起的申请' }}
        />
      )}

      <Modal
        title="申请进度"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={640}
      >
        {selected && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="流程名称" span={2}>
                {selected.processDef?.name ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={INSTANCE_STATUS_COLORS[selected.status] ?? 'default'}>
                  {INSTANCE_STATUS_LABELS[selected.status] ?? selected.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="发起时间">
                {new Date(selected.startedAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="申请内容" span={2}>
                {extractRecordTitle(selected.triggerContext) ?? '—'}
              </Descriptions.Item>
            </Descriptions>
            <TraceViewer trace={traceData ?? null} loading={traceLoading} />
          </>
        )}
      </Modal>
    </div>
  );
}
