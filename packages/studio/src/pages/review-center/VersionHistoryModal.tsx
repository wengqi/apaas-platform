/**
 * 资源版本链 Modal（历史提交：状态/来源/审批意见/对基线的变更摘要）。
 */

import { Modal, Table, Timeline } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import type { ResourceVersionDto } from '@apaas/shared';
import { qk } from '@apaas/shared/stores';
import { reviewsApi } from '../../api/reviews.js';
import { ModuleTag, SourceTag, StatusTag } from './labels.js';

interface VersionHistoryModalProps {
  appId: string;
  target: { module: string; entityId: string } | null;
  onClose: () => void;
}

export default function VersionHistoryModal({ appId, target, onClose }: VersionHistoryModalProps) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: qk.resourceVersions(appId, target?.module ?? '', target?.entityId ?? ''),
    queryFn: () =>
      reviewsApi.versions(appId, target!.module as ResourceVersionDto['module'], target!.entityId),
    enabled: !!target,
  });

  const columns: ColumnsType<ResourceVersionDto> = [
    { title: '版本', dataIndex: 'versionNumber', width: 70, render: (v: number) => `v${v}` },
    { title: '资源', dataIndex: 'name' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: ResourceVersionDto['status']) => <StatusTag status={status} />,
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 80,
      render: (source: ResourceVersionDto['source']) => <SourceTag source={source} />,
    },
    { title: '提交人', dataIndex: 'submittedBy', width: 120 },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => v.replace('T', ' ').slice(0, 19),
    },
  ];

  return (
    <Modal
      title={
        target && (
          <span>
            版本历史 <ModuleTag module={target.module as ResourceVersionDto['module']} />
          </span>
        )
      }
      open={!!target}
      onCancel={onClose}
      footer={null}
      width={760}
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={versions}
        loading={isLoading}
        size="small"
        pagination={false}
        expandable={{
          expandedRowRender: (record) =>
            record.reviewComment ? (
              <Timeline
                items={[
                  {
                    color: record.status === 'REJECTED' ? 'red' : 'green',
                    children: `审批意见：${record.reviewComment}`,
                  },
                ]}
              />
            ) : (
              <span style={{ color: '#999' }}>无审批意见</span>
            ),
          rowExpandable: (record) => !!record.reviewComment,
        }}
      />
    </Modal>
  );
}
