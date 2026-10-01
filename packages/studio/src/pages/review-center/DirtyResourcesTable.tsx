/**
 * 未提交变更表（"已保存未提交"）：漂移资源可撤销到基线；
 * 从未提交的资源在此提交基线（版本模型起点）。
 */

import { Button, Popconfirm, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DirtyResourceDto } from '@apaas/shared';
import { qk, reviewAffectedKeys } from '@apaas/shared/stores';
import { reviewsApi } from '../../api/reviews.js';
import { ModuleTag } from './labels.js';

interface DirtyResourcesTableProps {
  appId: string;
  onOpenVersions: (module: string, entityId: string) => void;
}

export default function DirtyResourcesTable({ appId, onOpenVersions }: DirtyResourcesTableProps) {
  const queryClient = useQueryClient();

  const { data: dirty = [], isLoading } = useQuery({
    queryKey: qk.reviewDirty(appId),
    queryFn: () => reviewsApi.dirty(appId),
  });

  const invalidate = (resource: DirtyResourceDto) => {
    for (const key of reviewAffectedKeys(appId, {
      module: resource.module,
      entityId: resource.entityId,
    })) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const submitMutation = useMutation({
    mutationFn: (resource: DirtyResourceDto) =>
      reviewsApi.submit(appId, { module: resource.module, entityId: resource.entityId }),
    onSuccess: (_data, resource) => {
      message.success(`已提交基线：${resource.name}`);
      invalidate(resource);
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const discardMutation = useMutation({
    mutationFn: (resource: DirtyResourceDto) =>
      reviewsApi.discard(appId, { module: resource.module, entityId: resource.entityId }),
    onSuccess: (_data, resource) => {
      message.success(`已撤销到基线：${resource.name}`);
      invalidate(resource);
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const columns: ColumnsType<DirtyResourceDto> = [
    {
      title: '模块',
      dataIndex: 'module',
      width: 90,
      render: (module: DirtyResourceDto['module']) => <ModuleTag module={module} />,
    },
    { title: '资源名', dataIndex: 'name' },
    { title: '标识', dataIndex: 'apiName', render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '基线版本',
      dataIndex: 'baselineVersionNumber',
      width: 110,
      render: (v: number | null) => (v === null ? <Tag color="warning">从未提交</Tag> : `v${v}`),
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <>
          <Button type="link" size="small" onClick={() => submitMutation.mutate(record)}>
            提交基线
          </Button>
          {record.baselineVersionNumber !== null && (
            <Popconfirm
              title="撤销未提交的修改？"
              description="活表将恢复到最新基线快照"
              onConfirm={() => discardMutation.mutate(record)}
            >
              <Button type="link" size="small" danger>
                撤销
              </Button>
            </Popconfirm>
          )}
          <Button
            type="link"
            size="small"
            onClick={() => onOpenVersions(record.module, record.entityId)}
          >
            版本历史
          </Button>
        </>
      ),
    },
  ];

  return (
    <>
      <Table
        rowKey={(r) => `${r.module}-${r.entityId}`}
        columns={columns}
        dataSource={dirty}
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: '所有资源均已与基线一致' }}
      />
    </>
  );
}
