/**
 * 应用成员页（ADR-0005，治理组）——所有者/协作者名单、添加协作者、移除、转移所有权。
 *
 * 权限：清单对全部成员可读；添加/移除/转移为所有者级（owner | admin），MEMBER 只读看名单。
 * 入口判定用 GET /design/apps/:appId 返回的 myRole（DesignAccessGuard 注入），后端
 * assertOwnerAccess 兜底——前端隐藏入口是体验层，不是安全层。
 */
import { useMemo, useState } from 'react';
import { Alert, Button, Card, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CrownOutlined,
  SwapOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { qk } from '@apaas/shared/stores';
import { appsApi } from '../api/apps.js';
import { appMembersApi, type AppMember } from '../api/app-members.js';
import { formatDateTime } from '../utils/user-display.js';

const { Title, Text } = Typography;

function errorMessage(err: unknown): string {
  const axErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败，请重试';
}

export default function AppMembers() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);

  /** 当前用户归属角色（与侧栏共用 qk.app 缓存）。 */
  const { data: app } = useQuery({
    queryKey: qk.app(appId!),
    queryFn: () => appsApi.get(appId as string),
    enabled: !!appId,
  });
  const canManage = app?.myRole === 'owner' || app?.myRole === 'admin';

  const { data: members = [], isLoading } = useQuery({
    queryKey: qk.appMembers(appId!),
    queryFn: () => appMembersApi.list(appId!),
    enabled: !!appId,
  });

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: qk.appMemberCandidates(appId!),
    queryFn: () => appMembersApi.candidates(appId!),
    enabled: !!appId && canManage && addOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.appMembers(appId!) });
    void queryClient.invalidateQueries({ queryKey: qk.appMemberCandidates(appId!) });
    // 转移所有权会改变当前用户的 myRole 与开发中心卡片标记
    void queryClient.invalidateQueries({ queryKey: qk.app(appId!) });
    void queryClient.invalidateQueries({ queryKey: qk.apps() });
  };

  const addMutation = useMutation({
    mutationFn: (userId: string) => appMembersApi.add(appId!, userId),
    onSuccess: () => {
      message.success('已添加协作者');
      setAddOpen(false);
      setSelectedUserId(undefined);
      invalidate();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => appMembersApi.remove(appId!, userId),
    onSuccess: () => {
      message.success('已移除协作者');
      invalidate();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const transferMutation = useMutation({
    mutationFn: (userId: string) => appMembersApi.transferOwner(appId!, userId),
    onSuccess: () => {
      message.success('所有权已转移，原所有者已转为协作者');
      invalidate();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const confirmRemove = (m: AppMember) => {
    Modal.confirm({
      title: '移除协作者',
      content: `确定将「${m.name ?? m.email}」移出本应用？移除后其将无法在搭建器中打开该应用（已发布应用的业务使用权不受影响）。`,
      okText: '移除',
      okButtonProps: { danger: true },
      onOk: () => removeMutation.mutateAsync(m.userId),
    });
  };

  const confirmTransfer = (m: AppMember) => {
    Modal.confirm({
      title: '转移所有权',
      content: `确定将应用所有权转移给「${m.name ?? m.email}」？你将自动转为协作者，删除/归档/成员管理将由新所有者或管理员执行。`,
      okText: '确认转移',
      onOk: () => transferMutation.mutateAsync(m.userId),
    });
  };

  const columns = useMemo<ColumnsType<AppMember>>(
    () => [
      {
        title: '成员',
        key: 'user',
        render: (_, m) => (
          <Space direction="vertical" size={0}>
            <Text strong>{m.name ?? '（未命名）'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {m.email}
            </Text>
          </Space>
        ),
      },
      {
        title: '角色',
        dataIndex: 'role',
        width: 120,
        render: (role: AppMember['role']) =>
          role === 'owner' ? (
            <Tag icon={<CrownOutlined />} color="blue">
              所有者
            </Tag>
          ) : (
            <Tag>协作者</Tag>
          ),
      },
      {
        title: '加入时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (v: string) => formatDateTime(v),
      },
      ...(canManage
        ? [
            {
              title: '操作',
              key: 'actions',
              width: 220,
              render: (_: unknown, m: AppMember) =>
                m.role === 'owner' ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    所有者不可移除，可转移
                  </Text>
                ) : (
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      icon={<SwapOutlined />}
                      onClick={() => confirmTransfer(m)}
                    >
                      转为所有者
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<UserDeleteOutlined />}
                      onClick={() => confirmRemove(m)}
                    >
                      移除
                    </Button>
                  </Space>
                ),
            } satisfies ColumnsType<AppMember>[number],
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage],
  );

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            成员
          </Title>
          <Text type="secondary">
            应用归属：所有者唯一，协作者拥有全部搭建能力；删除、归档、转移所有权与成员管理仅所有者或管理员可执行。
          </Text>
        </div>
        {canManage && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
            添加协作者
          </Button>
        )}
      </div>

      {app && !canManage && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="你是本应用的协作者"
          description="成员管理由应用所有者或租户管理员执行；如需调整，请联系所有者。"
        />
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Table<AppMember>
          rowKey="userId"
          columns={columns}
          dataSource={members}
          loading={isLoading}
          pagination={false}
          size="middle"
        />
      </Card>

      <Modal
        title="添加协作者"
        open={addOpen}
        onCancel={() => {
          setAddOpen(false);
          setSelectedUserId(undefined);
        }}
        onOk={() => selectedUserId && addMutation.mutate(selectedUserId)}
        okText="添加"
        okButtonProps={{ disabled: !selectedUserId, loading: addMutation.isPending }}
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          候选为本租户具备搭建者（BUILDER）角色且尚未加入本应用的用户；租户管理员恒可访问全部应用，无需添加。
        </Text>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder={candidatesLoading ? '加载候选中…' : '选择用户'}
          loading={candidatesLoading}
          value={selectedUserId}
          onChange={setSelectedUserId}
          optionFilterProp="label"
          notFoundContent={candidatesLoading ? null : '暂无可添加的搭建者'}
          options={candidates.map((c) => ({
            value: c.userId,
            label: `${c.name}（${c.email}）`,
          }))}
        />
      </Modal>
    </div>
  );
}
