import { Card, Table, Tag, Button, Typography, Space, Popconfirm, message } from 'antd';
import { RollbackOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { publishAffectedKeys, qk } from '@apaas/shared/stores';
import { publishApi } from '../api/publish.js';
import { usersApi } from '../api/permissions.js';
import type { AppVersionSummary } from '@apaas/shared';

const { Title } = Typography;

/**
 * 版本历史页面 — 展示所有发布版本，支持回滚。
 */
export default function VersionHistory() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /** 获取版本列表 */
  const { data: versions, isLoading } = useQuery({
    queryKey: qk.appVersions(appId!),
    queryFn: () => publishApi.listVersions(appId!),
    enabled: !!appId,
  });

  // 发布人显示名映射（QA 交互评审 2026-10-03：此前直接显示用户 ID）
  const { data: users } = useQuery({
    queryKey: qk.users(),
    queryFn: () => usersApi.list(),
  });
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  /** 回滚 mutation */
  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => publishApi.rollback(appId!, versionId),
    onSuccess: () => {
      message.success('回滚成功');
      // 评审 P2-1：回滚会改写发布快照与页面/对象的发布状态，统一失效受影响键
      for (const key of publishAffectedKeys(appId!)) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: () => message.error('回滚失败'),
  });

  const columns = [
    {
      title: '版本号',
      dataIndex: 'versionNumber',
      key: 'versionNumber',
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'PUBLISHED' ? 'green' : 'default'}>
          {status === 'PUBLISHED' ? '已发布' : '已回滚'}
        </Tag>
      ),
    },
    {
      title: '发布人',
      dataIndex: 'publishedBy',
      key: 'publishedBy',
      render: (v: string, record: AppVersionSummary) =>
        record.publishedByName ?? userNameById.get(v) ?? v,
    },
    {
      title: '发布时间',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: AppVersionSummary) => (
        <Popconfirm
          title="确认回滚"
          description={`确定要回滚到版本 ${record.versionNumber} 吗？`}
          onConfirm={() => rollbackMutation.mutate(record.id)}
          okText="确认"
          cancelText="取消"
        >
          <Button
            size="small"
            icon={<RollbackOutlined />}
            loading={rollbackMutation.isPending}
            disabled={record.status !== 'PUBLISHED'}
          >
            回滚
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/app/${appId}/dashboard`)}>
            返回
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            版本历史
          </Title>
        </Space>
        <Button type="primary" onClick={() => navigate(`/app/${appId}/publish`)}>
          发布新版本
        </Button>
      </div>

      <Table
        dataSource={versions ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="middle"
      />
    </Card>
  );
}
