/**
 * 开发中心首页（/apps，素蓝 v8 定稿 2026-10-13）。
 *
 * 结构：问候+搜索 → 待办条 → 指标行 → 应用库（分组平铺+定位轨）→ 最近动态。
 * 展示件与 CRUD 拆见 ./home-bits.tsx 与 ./useAppCrud.ts。
 */

import { useMemo, useState } from 'react';
import { Button, Empty, Form, Input, Modal, Space, Spin, Typography } from 'antd';
import {
  AppstoreAddOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qk, useAuthStore } from '@apaas/shared/stores';
import { TOKENS as T } from '@apaas/shared/design';
import { appsApi, type AppSummary } from '../../api/apps.js';
import { reviewsApi } from '../../api/reviews.js';
import { processesApi } from '../../api/processes.js';
import { auditLogsApi } from '../../api/audit-logs.js';
import { useUserNameMap } from '../../utils/user-display.js';
import { AppCard } from '../app-list/AppCard.js';
import { type CreateFormValues } from '../app-list/constants.js';
import { CreateAppModal, EditAppModal } from '../app-list/AppFormModals.js';
import AppHeader from '../app-list/AppHeader.js';
import GroupLocatorRail, {
  groupAnchorId,
  RAIL_ALL_KEY,
  UNGROUPED_KEY,
  type AppGroup,
} from './GroupLocatorRail.js';
import GroupsDrawer from './GroupsDrawer.js';
import GroupSelect from './GroupSelect.js';
import { ActivityFeed, KpiRow, TodoStrip } from './home-bits.js';
import { useAppCrud } from './useAppCrud.js';

const { Title, Text } = Typography;

export default function DevCenterHome() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppSummary | null>(null);
  const [movingApp, setMovingApp] = useState<AppSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeKey, setActiveKey] = useState(RAIL_ALL_KEY);
  const [form] = Form.useForm<CreateFormValues>();
  const [moveForm] = Form.useForm<{ group: string }>();

  const { data: apps, isLoading } = useQuery({
    queryKey: qk.apps(),
    queryFn: () => appsApi.list(),
  });
  const { data: pending } = useQuery({
    queryKey: ['reviews', 'pending-summary'],
    queryFn: () => reviewsApi.pendingSummary(),
  });
  const { data: analytics } = useQuery({
    queryKey: ['processes', 'analytics', 'home'],
    queryFn: () => processesApi.analytics(),
  });
  // 最近动态：全租户审计仅管理员可读（TenantAdminGuard）——builder 不发查询，
  // 动态区对 builder 隐藏（builder 可读的搭建动态源登记为后续项）
  const isTenantAdmin =
    Boolean(user?.isPlatformAdmin) || Boolean(user?.roles?.some((r) => r.code === 'TENANT_ADMIN'));
  const { data: activity } = useQuery({
    queryKey: ['audit-logs', 'home-feed'],
    queryFn: () => auditLogsApi.query({ page: 1, pageSize: 4 }),
    enabled: isTenantAdmin,
  });
  const userNameMap = useUserNameMap();

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  /** 分组归并（含未分组），名称字典序、未分组恒最后；key 供定位轨/锚点消歧。 */
  const groups: AppGroup[] = useMemo(() => {
    const map = new Map<string, AppSummary[]>();
    for (const app of apps ?? []) {
      const key = app.group ?? UNGROUPED_KEY;
      (map.get(key) ?? map.set(key, []).get(key)!).push(app);
    }
    const named = [...map.entries()]
      .filter(([k]) => k !== UNGROUPED_KEY)
      .sort(([a], [b]) => a.localeCompare(b, 'zh'));
    const all: AppGroup[] = named.map(([key, list]) => ({
      key,
      name: key,
      apps: list,
    }));
    const ungrouped = map.get(UNGROUPED_KEY);
    if (ungrouped && ungrouped.length > 0) {
      all.push({ key: UNGROUPED_KEY, name: null, apps: ungrouped });
    }
    return all;
  }, [apps]);

  /** 搜索过滤（名称+描述），过滤后仍按组归并。 */
  const visibleGroups: AppGroup[] = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return groups;
    return groups
      .map((g) => ({
        ...g,
        apps: g.apps.filter(
          (a) =>
            a.name.toLowerCase().includes(kw) || (a.description ?? '').toLowerCase().includes(kw),
        ),
      }))
      .filter((g) => g.apps.length > 0);
  }, [groups, keyword]);

  const totalVisible = visibleGroups.reduce((sum, g) => sum + g.apps.length, 0);

  const {
    createMutation,
    deleteMutation,
    archiveMutation,
    updateMutation,
    moveMutation,
    refreshApps,
  } = useAppCrud({ form, moveForm, setCreateOpen, setEditingApp, setMovingApp });

  const cardMenuItems = (app: AppSummary): MenuProps['items'] => [
    { key: 'edit', icon: <EditOutlined />, label: '编辑应用' },
    { key: 'move', icon: <ArrowRightOutlined />, label: '移动到分组' },
    ...(app.status === 'PUBLISHED'
      ? [{ key: 'archive', icon: <InboxOutlined />, label: '归档应用' }]
      : []),
    ...(app.status === 'DRAFT' || app.status === 'ARCHIVED'
      ? [{ key: 'delete', icon: <DeleteOutlined />, label: '删除应用', danger: true }]
      : []),
  ];

  const handleCardMenu = (app: AppSummary, info: { key: string }) => {
    if (info.key === 'edit') {
      setEditingApp(app);
      form.setFieldsValue({
        apiName: app.apiName,
        name: app.name,
        description: app.description,
        group: app.group,
      });
    } else if (info.key === 'move') {
      setMovingApp(app);
      moveForm.setFieldsValue({ group: app.group ?? '' });
    } else if (info.key === 'delete') {
      Modal.confirm({
        title: '删除应用',
        content:
          app.status === 'ARCHIVED'
            ? `确定要彻底删除已归档应用「${app.name}」吗？删除后不可恢复，应用下的所有数据将一并删除。`
            : `确定要删除应用「${app.name}」吗？删除后不可恢复，应用下的所有对象、页面、流程数据将一并删除。`,
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => deleteMutation.mutate(app.id),
      });
    } else if (info.key === 'archive') {
      Modal.confirm({
        title: '归档应用',
        content: `确定要归档应用「${app.name}」吗？归档后运行时不再展示此应用，不可提交新申请。在途流程仍可正常完成。`,
        okText: '确认归档',
        cancelText: '取消',
        onOk: () => archiveMutation.mutate(app.id),
      });
    }
  };

  const openCreate = () => {
    form.resetFields();
    setCreateOpen(true);
  };
  const groupNames = groups.filter((g) => g.name !== null).map((g) => g.name as string);

  const renderCard = (app: AppSummary) => (
    <AppCard
      app={app}
      groupNames={groupNames}
      menuItems={cardMenuItems(app)}
      onMenuClick={(info) => handleCardMenu(app, info)}
      onOpen={() => navigate(`/app/${app.id}/dashboard`)}
    />
  );

  return (
    <div style={{ minHeight: '100vh', background: T.colorBgLayout }}>
      <AppHeader
        isPlatformAdmin={Boolean(user?.isPlatformAdmin)}
        isTenantAdmin={Boolean(user?.roles?.some((r) => r.code === 'TENANT_ADMIN'))}
        userName={user?.name ?? user?.email ?? '用户'}
        userAvatar={user?.avatar ?? undefined}
        onNavigate={navigate}
        onLogout={() => {
          logout();
          navigate('/login', { replace: true });
        }}
      />
      <div
        style={{
          maxWidth: 1340,
          margin: '0 auto',
          padding: '34px 44px 40px',
          display: 'flex',
          gap: 52,
          alignItems: 'start',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div>
              <Title level={3} style={{ fontSize: 26, margin: 0 }}>
                {greeting}，{user?.name ?? '搭建者'}
              </Title>
              <Text type="secondary" style={{ display: 'block', fontSize: 13.5, marginTop: 6 }}>
                共 {apps?.length ?? 0} 个应用 · {groups.filter((g) => g.name !== null).length}{' '}
                个分组
                {pending && pending.total > 0 ? ` · 今天有 ${pending.total} 件提交等待审核` : ''}
              </Text>
            </div>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: T.colorTextQuaternary }} />}
              placeholder="搜索应用名称、描述…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ marginLeft: 'auto', width: 320, height: 38, flexShrink: 0 }}
            />
          </div>

          <TodoStrip
            total={pending?.total ?? 0}
            items={pending?.items ?? []}
            onGoReview={() => {
              const first = pending?.items[0];
              if (first) navigate(`/app/${first.appId}/reviews`);
            }}
          />

          <KpiRow
            appCount={apps?.length ?? 0}
            running={analytics?.totals.running ?? 0}
            completedToday={analytics?.totals.completed ?? 0}
            timedOut={analytics?.totals.timedOut ?? 0}
            pendingTotal={pending?.total ?? 0}
          />

          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 26 }}>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: '0.12em',
                color: T.colorTextQuaternary,
                fontWeight: 600,
              }}
            >
              应 用 库
            </Text>
            <Space style={{ marginLeft: 'auto' }}>
              <Button
                type="primary"
                icon={<AppstoreAddOutlined />}
                onClick={() => {
                  form.resetFields();
                  setCreateOpen(true);
                }}
              >
                创建应用
              </Button>
              <Button type="link" onClick={openCreate} style={{ fontWeight: 600, padding: 0 }}>
                ＋ 新建分组
              </Button>
              <Button
                type="text"
                onClick={() => setDrawerOpen(true)}
                style={{ color: T.colorTextSecondary }}
              >
                管理分组
              </Button>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={refreshApps}
                aria-label="刷新应用列表"
              />
            </Space>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 80 }}>
              <Spin size="large" />
            </div>
          ) : totalVisible === 0 ? (
            <div
              style={{
                marginTop: 26,
                border: `2px dashed ${T.colorBorderSecondary}`,
                borderRadius: 12,
                background: T.colorBgContainer,
                padding: '60px 0',
              }}
            >
              <Empty
                description={keyword ? `没有匹配「${keyword}」的应用` : '还没有应用'}
                style={{ padding: '20px 0' }}
              >
                <Button
                  type="primary"
                  size="large"
                  icon={<AppstoreAddOutlined />}
                  onClick={openCreate}
                >
                  创建第一个应用
                </Button>
              </Empty>
            </div>
          ) : (
            visibleGroups.map((g) => (
              <section
                key={g.key}
                data-group-anchor={g.key}
                id={groupAnchorId(g.key)}
                style={{ paddingTop: 26, scrollMarginTop: 76 }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                  <Title level={5} style={{ fontSize: 16, margin: 0 }}>
                    {g.name ?? '未分组'}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {g.apps.length} 个应用
                  </Text>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16,
                  }}
                >
                  {g.apps.map((app) => (
                    <div key={app.id}>{renderCard(app)}</div>
                  ))}
                </div>
              </section>
            ))
          )}

          <ActivityFeed
            items={activity?.items ?? []}
            nameMap={userNameMap}
            onViewAll={() => navigate('/platform/audit-logs')}
          />
        </div>

        <GroupLocatorRail groups={visibleGroups} activeKey={activeKey} onSelect={setActiveKey} />
      </div>

      <CreateAppModal
        open={createOpen}
        form={form}
        groupNames={groupNames}
        confirmLoading={createMutation.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          createMutation.mutate({
            apiName: values.apiName || undefined,
            name: values.name,
            description: values.description,
            group: values.group || undefined,
          });
        }}
      />
      <EditAppModal
        app={editingApp}
        form={form}
        groupNames={groupNames}
        confirmLoading={updateMutation.isPending}
        onCancel={() => {
          setEditingApp(null);
          form.resetFields();
        }}
        onOk={async () => {
          if (!editingApp) return;
          const values = await form.validateFields();
          updateMutation.mutate({
            appId: editingApp.id,
            data: {
              name: values.name,
              description: values.description,
              group: values.group || undefined,
            },
          });
        }}
      />

      <Modal
        title={`移动「${movingApp?.name ?? ''}」到分组`}
        open={movingApp !== null}
        confirmLoading={moveMutation.isPending}
        onCancel={() => setMovingApp(null)}
        onOk={async () => {
          const values = await moveForm.validateFields();
          moveMutation.mutate({ appId: movingApp!.id, group: values.group });
        }}
        okText="移动"
        cancelText="取消"
      >
        <Form form={moveForm} layout="vertical">
          <Form.Item label="目标分组" name="group">
            <GroupSelect groupNames={groupNames} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            输入现有分组名，或输入新分组名直接建组；清空则移入「未分组」。
          </Text>
        </Form>
      </Modal>

      <GroupsDrawer
        open={drawerOpen}
        groups={groups}
        onClose={() => setDrawerOpen(false)}
        onChanged={refreshApps}
      />
    </div>
  );
}
