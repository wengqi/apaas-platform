/**
 * 开发中心首页（/apps，素蓝 v8.1：卡片/列表双视图 + 定位轨 + 分组管理）。
 *
 * 结构：问候+搜索 → 待办条 → 指标行 → 应用库工具行（创建/视图切换）→
 *       卡片视图（分组平铺+定位轨 scrollspy）| 列表视图（高密度行+分组筛选）→ 最近动态。
 * 注：无独立「新建分组」入口——分组随应用产生（见 GroupsDrawer 头注释），
 *     建组走 创建应用分组字段 / 移动到分组 / 管理分组抽屉。
 * 展示件与 CRUD 拆见 ./home-bits.tsx、./useAppCrud.ts、./AppListView.tsx、./AppHomeDialogs.tsx。
 */

import { useMemo, useState } from 'react';
import { Button, Empty, Form, Modal, Segmented, Space, Spin, Typography } from 'antd';
import {
  AppstoreAddOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
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
import AppListView from './AppListView.js';
import AppHomeDialogs from './AppHomeDialogs.js';
import GroupLocatorRail, { UNGROUPED_KEY, type AppGroup } from './GroupLocatorRail.js';
import GroupsDrawer from './GroupsDrawer.js';
import { ActivityFeed, GroupCardSections, HomeTopBlocks } from './home-bits.js';
import { useAppCrud } from './useAppCrud.js';

const { Text } = Typography;

/** 视图模式本地记忆键。 */
const VIEW_KEY = 'apaas:devcenter.view';

export default function DevCenterHome() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppSummary | null>(null);
  const [movingApp, setMovingApp] = useState<AppSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() =>
    localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'card',
  );
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
  // 最近动态：全租户审计仅管理员可读（TenantAdminGuard）——builder 不发查询
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

  /** 分组归并（含未分组），名称字典序、未分组恒最后。 */
  const groups: AppGroup[] = useMemo(() => {
    const map = new Map<string, AppSummary[]>();
    for (const app of apps ?? []) {
      const key = app.group ?? UNGROUPED_KEY;
      (map.get(key) ?? map.set(key, []).get(key)!).push(app);
    }
    const named = [...map.entries()]
      .filter(([k]) => k !== UNGROUPED_KEY)
      .sort(([a], [b]) => a.localeCompare(b, 'zh'));
    const all: AppGroup[] = named.map(([key, list]) => ({ key, name: key, apps: list }));
    const ungrouped = map.get(UNGROUPED_KEY);
    if (ungrouped && ungrouped.length > 0) {
      all.push({ key: UNGROUPED_KEY, name: null, apps: ungrouped });
    }
    return all;
  }, [apps]);

  const groupNames = groups.filter((g) => g.name !== null).map((g) => g.name as string);

  /** 关键字过滤（列表视图数据源；分组高亮由定位轨内化管理）。 */
  const filteredApps = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return apps ?? [];
    return (apps ?? []).filter(
      (a) => a.name.toLowerCase().includes(kw) || (a.description ?? '').toLowerCase().includes(kw),
    );
  }, [apps, keyword]);

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
    // ADR-0005：归档/删除为所有者级操作，协作者（myRole=member）菜单不出现
    ...(app.myRole !== 'member' && app.status === 'PUBLISHED'
      ? [{ key: 'archive', icon: <InboxOutlined />, label: '归档应用' }]
      : []),
    ...(app.myRole !== 'member' && (app.status === 'DRAFT' || app.status === 'ARCHIVED')
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

  const renderCard = (app: AppSummary) => (
    <AppCard
      app={app}
      menuItems={cardMenuItems(app)}
      onMenuClick={(info) => handleCardMenu(app, info)}
      onOpen={() => navigate(`/app/${app.id}/dashboard`)}
    />
  );

  return (
    <>
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
          <HomeTopBlocks
            greeting={greeting}
            userName={user?.name ?? '搭建者'}
            appCount={apps?.length ?? 0}
            groupCount={groups.filter((g) => g.name !== null).length}
            pendingTotal={pending?.total ?? 0}
            pendingItems={pending?.items ?? []}
            keyword={keyword}
            onKeywordChange={setKeyword}
            onGoReview={() => {
              const first = pending?.items[0];
              if (first) navigate(`/app/${first.appId}/reviews`);
            }}
            analytics={analytics}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
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
                <Button type="primary" icon={<AppstoreAddOutlined />} onClick={openCreate}>
                  创建应用
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
                <Segmented
                  value={viewMode}
                  onChange={(v) => {
                    setViewMode(v as 'card' | 'list');
                    localStorage.setItem(VIEW_KEY, v as string);
                  }}
                  aria-label="视图切换"
                  options={[
                    { value: 'card', title: '卡片视图', icon: <AppstoreAddOutlined /> },
                    { value: 'list', title: '列表视图', icon: <UnorderedListOutlined /> },
                  ]}
                />
              </Space>
            </div>
          </HomeTopBlocks>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 80 }}>
              <Spin size="large" />
            </div>
          ) : viewMode === 'list' ? (
            filteredApps.length === 0 ? (
              <div style={{ marginTop: 20 }}>
                <Empty
                  description={keyword ? `没有匹配「${keyword}」的应用` : '该筛选下暂无应用'}
                  style={{ padding: '40px 0' }}
                />
              </div>
            ) : (
              <AppListView
                apps={filteredApps}
                menuItemsFor={cardMenuItems}
                onMenuClick={handleCardMenu}
                onOpen={(app) => navigate(`/app/${app.id}/dashboard`)}
              />
            )
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
            <GroupCardSections groups={visibleGroups} renderCard={renderCard} />
          )}

          <ActivityFeed
            items={activity?.items ?? []}
            nameMap={userNameMap}
            onViewAll={() => navigate('/platform/audit-logs')}
          />
        </div>

        {viewMode === 'card' && <GroupLocatorRail groups={visibleGroups} enableSpy />}
      </div>

      <AppHomeDialogs
        groupNames={groupNames}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        editingApp={editingApp}
        setEditingApp={setEditingApp}
        movingApp={movingApp}
        setMovingApp={setMovingApp}
        form={form}
        moveForm={moveForm}
        createPending={createMutation.isPending}
        updatePending={updateMutation.isPending}
        movePending={moveMutation.isPending}
        onCreate={(values) =>
          createMutation.mutate({
            apiName: values.apiName || undefined,
            name: values.name,
            description: values.description,
            group: values.group || undefined,
          })
        }
        onUpdate={(appId, values) =>
          updateMutation.mutate({
            appId,
            data: {
              name: values.name,
              description: values.description,
              group: values.group || undefined,
            },
          })
        }
        onMove={(appId, group) => moveMutation.mutate({ appId, group: group || undefined })}
      />

      <GroupsDrawer
        open={drawerOpen}
        groups={groups}
        onClose={() => setDrawerOpen(false)}
        onChanged={refreshApps}
      />
    </>
  );
}
