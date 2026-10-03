/**
 * 审核中心（R1.2 版本模型，G1 验收项：diff 快审）。
 *
 * 三个页签：
 * - 待审：AI 提交的 PENDING 单（列表附 diff 摘要，抽屉内 diff 快审 + 一键批/驳）
 * - 已处理：APPROVED / REJECTED 记录（含审批意见）
 * - 未提交变更：漂移/从未提交资源（提交基线 / 撤销未提交 / 版本历史）
 */

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResourceVersionListItemDto } from '@apaas/shared';
import { qk, reviewAffectedKeys } from '@apaas/shared/stores';
import { reviewsApi } from '../api/reviews.js';
import DiffDrawer from './review-center/DiffDrawer.js';
import DirtyResourcesTable from './review-center/DirtyResourcesTable.js';
import VersionHistoryModal from './review-center/VersionHistoryModal.js';
import { ModuleTag, SourceTag, StatusTag } from './review-center/labels.js';

const { Text } = Typography;

type TabKey = 'pending' | 'handled' | 'dirty';

/**
 * 批量提交组操作条（submit_app_drafts 单波进审的资源链）。
 * 一键批准 = 对象→页面→流程拓扑序落地 + @ref: 引用令牌解析；
 * 批量驳回级联整批（防半批落地的悬挂引用）。
 */
function BatchBar({ appId, pending }: { appId: string; pending: ResourceVersionListItemDto[] }) {
  const queryClient = useQueryClient();

  const batches = useMemo(() => {
    const byBatch = new Map<string, ResourceVersionListItemDto[]>();
    for (const item of pending) {
      if (!item.batchId) continue;
      const list = byBatch.get(item.batchId) ?? [];
      list.push(item);
      byBatch.set(item.batchId, list);
    }
    return [...byBatch.entries()];
  }, [pending]);

  const refresh = () => {
    for (const key of reviewAffectedKeys(appId)) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const approveMutation = useMutation({
    mutationFn: (batchId: string) => reviewsApi.approveBatch(appId, batchId),
    onSuccess: (rows) => {
      message.success(`批量批准成功（${rows.length} 项资源已按依赖顺序落地）`);
      refresh();
    },
    onError: (err: Error) => message.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ batchId, comment }: { batchId: string; comment: string }) =>
      reviewsApi.rejectBatch(appId, batchId, comment),
    onSuccess: (res) => {
      message.success(`批量驳回（${res.rejected} 项）`);
      refresh();
    },
    onError: (err: Error) => message.error(err.message),
  });

  const rejectWithComment = (batchId: string) => {
    let comment = '';
    Modal.confirm({
      title: '批量驳回该批次？',
      content: (
        <Input.TextArea
          placeholder="驳回意见（必填，将回传提交者）"
          rows={3}
          onChange={(e) => {
            comment = e.target.value;
          }}
        />
      ),
      okText: '确认驳回',
      okType: 'danger',
      onOk: async () => {
        if (!comment.trim()) {
          message.warning('请填写驳回意见');
          throw new Error('comment required'); // 抛错保持弹窗开启
        }
        await rejectMutation.mutateAsync({ batchId, comment: comment.trim() });
      },
    });
  };

  if (batches.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      {batches.map(([batchId, items]) => (
        <div
          key={batchId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: '#f6f8fa',
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          <Tag icon={<ThunderboltOutlined />} color="geekblue">
            批量提交
          </Tag>
          <Text style={{ flex: 1 }} ellipsis={{ tooltip: items.map((i) => i.name).join('、') }}>
            {items.length} 项资源：{items.map((i) => i.name).join('、')}
          </Text>
          <Space>
            <Popconfirm
              title="一键批准整个批次？"
              description="将按 对象→页面→流程 顺序落地并自动解析跨资源引用"
              onConfirm={() => approveMutation.mutate(batchId)}
            >
              <Button type="primary" size="small" loading={approveMutation.isPending}>
                一键批准
              </Button>
            </Popconfirm>
            <Button danger size="small" onClick={() => rejectWithComment(batchId)}>
              批量驳回
            </Button>
          </Space>
        </div>
      ))}
    </div>
  );
}

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
    {
      title: '资源名',
      dataIndex: 'name',
      render: (_, record) => (
        <span>
          {record.batchId && (
            <Tag color="geekblue" style={{ marginRight: 6 }}>
              批次
            </Tag>
          )}
          {record.name}
        </span>
      ),
    },
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
        <>
          <BatchBar appId={appId} pending={pending} />
          <SubmissionTable
            appId={appId}
            items={pending}
            isLoading={pendingLoading}
            onOpen={setSelected}
            showReviewResult={false}
          />
        </>
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
