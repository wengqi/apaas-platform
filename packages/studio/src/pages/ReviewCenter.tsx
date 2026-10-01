/**
 * 审核中心（R1.2 版本模型，G1 验收项：diff 快审）。
 *
 * 三个页签：
 * - 待审：AI 提交的 PENDING 单（列表附 diff 摘要，抽屉内 diff 快审 + 一键批/驳）
 * - 已处理：APPROVED / REJECTED 记录（含审批意见）
 * - 未提交变更：漂移/从未提交资源（提交基线 / 撤销未提交 / 版本历史）
 */

import { useMemo, useState } from 'react';
import { Button, Card, Table, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResourceVersionListItemDto } from '@apaas/shared';
import { qk, reviewAffectedKeys } from '@apaas/shared/stores';
import { reviewsApi } from '../api/reviews.js';
import DiffDrawer from './review-center/DiffDrawer.js';
import DirtyResourcesTable from './review-center/DirtyResourcesTable.js';
import VersionHistoryModal from './review-center/VersionHistoryModal.js';
import { ModuleTag, SourceTag, StatusTag } from './review-center/labels.js';

type TabKey = 'pending' | 'handled' | 'dirty';

function SubmissionTable({
  appId,
  items,
  isLoading,
  onOpen,
  showReviewResult,
}: {
  appId: string;
  items: ResourceVersionListItemDto[];
  isLoading: boolean;
  onOpen: (item: ResourceVersionListItemDto) => void;
  showReviewResult: boolean;
}) {
  void appId;
  const columns: ColumnsType<ResourceVersionListItemDto> = [
    {
      title: '模块',
      dataIndex: 'module',
      width: 90,
      render: (module: ResourceVersionListItemDto['module']) => <ModuleTag module={module} />,
    },
    { title: '资源名', dataIndex: 'name' },
    {
      title: '来源',
      dataIndex: 'source',
      width: 80,
      render: (source: ResourceVersionListItemDto['source']) => <SourceTag source={source} />,
    },
    { title: '版本', dataIndex: 'versionNumber', width: 70, render: (v: number) => `v${v}` },
    {
      title: '变更',
      key: 'diff',
      width: 220,
      render: (_, record) => record.diff?.summary || '-',
    },
    { title: '提交人', dataIndex: 'submittedBy', width: 120 },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => v.replace('T', ' ').slice(0, 19),
    },
    ...(showReviewResult
      ? [
          {
            title: '结果',
            key: 'result',
            width: 220,
            render: (_: unknown, record: ResourceVersionListItemDto) => (
              <span>
                <StatusTag status={record.status} />
                {record.reviewComment && (
                  <span style={{ color: '#999', fontSize: 12 }}>{record.reviewComment}</span>
                )}
              </span>
            ),
          } satisfies ColumnsType<ResourceVersionListItemDto>[number],
        ]
      : []),
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => onOpen(record)}>
          查看 diff
        </Button>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={isLoading}
      size="small"
      pagination={{ pageSize: 10, showSizeChanger: false }}
    />
  );
}

export default function ReviewCenter() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('pending');
  const [selected, setSelected] = useState<ResourceVersionListItemDto | null>(null);
  const [versionTarget, setVersionTarget] = useState<{ module: string; entityId: string } | null>(
    null,
  );

  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: qk.reviews(appId!, 'PENDING'),
    queryFn: () => reviewsApi.list(appId!, { status: 'PENDING' }),
    enabled: !!appId,
  });
  const { data: handled = [], isLoading: handledLoading } = useQuery({
    queryKey: qk.reviews(appId!, 'HANDLED'),
    queryFn: async () => {
      const [approved, rejected] = await Promise.all([
        reviewsApi.list(appId!, { status: 'APPROVED' }),
        reviewsApi.list(appId!, { status: 'REJECTED' }),
      ]);
      return [...approved, ...rejected].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    enabled: !!appId,
  });

  const items = useMemo(
    () => [
      { key: 'pending', label: `待审（${pending.length}）` },
      { key: 'handled', label: '已处理' },
      { key: 'dirty', label: '未提交变更' },
    ],
    [pending.length],
  );

  if (!appId) return null;

  return (
    <Card
      title={
        <span>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/app/${appId}/dashboard`)}
            style={{ marginRight: 8 }}
          />
          审核中心
        </span>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            for (const key of reviewAffectedKeys(appId)) {
              void queryClient.invalidateQueries({ queryKey: key });
            }
          }}
        >
          刷新
        </Button>
      }
    >
      <Tabs activeKey={tab} items={items} onChange={(k) => setTab(k as TabKey)} />
      {tab === 'pending' && (
        <SubmissionTable
          appId={appId}
          items={pending}
          isLoading={pendingLoading}
          onOpen={setSelected}
          showReviewResult={false}
        />
      )}
      {tab === 'handled' && (
        <SubmissionTable
          appId={appId}
          items={handled}
          isLoading={handledLoading}
          onOpen={setSelected}
          showReviewResult={true}
        />
      )}
      {tab === 'dirty' && (
        <DirtyResourcesTable
          appId={appId}
          onOpenVersions={(module, entityId) => setVersionTarget({ module, entityId })}
        />
      )}

      <DiffDrawer appId={appId} submission={selected} onClose={() => setSelected(null)} />
      <VersionHistoryModal
        appId={appId}
        target={versionTarget}
        onClose={() => setVersionTarget(null)}
      />
    </Card>
  );
}
