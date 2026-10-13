/**
 * runtime 首页 — 我的应用门户（素蓝 v3 定稿 2026-10-13）。
 *
 * 结构：问候 + 应用搜索 → 审批待办条（直达任务中心）→ 业务指标行
 *       （待我审批 / 本月已办结）→ 分组只读分节 + 右侧分组定位轨。
 * 业务面约束：卡片无版本工程计数以外的行话；分组只读（无管理入口）；
 * 分组 <2 时定位轨自动隐藏；列表模式不显示定位轨（与 studio 交互一致）。
 * 定位轨选中/跟随逻辑见 PortalGroupRail（与 studio GroupLocatorRail 同一修复）。
 */

import { useMemo, useState } from 'react';
import { Button, Empty, Input, Segmented, Spin, Typography } from 'antd';
import { SearchOutlined, UnorderedListOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { qk, useAuthStore } from '@apaas/shared/stores';
import { TOKENS as T } from '@apaas/shared/design';
import { useNavigate } from 'react-router-dom';
import { appsApi, type AppSummary } from '../api/apps';
import { tasksApi } from '../api/tasks';
import PortalListView from './PortalListView';
import PortalGroupRail from './PortalGroupRail';
import PortalAppCard from './PortalAppCard';

const { Text, Title } = Typography;

/** 待办条展示的任务数 / 已办月计数取数上限。 */
const TODO_STRIP_SIZE = 5;
const COMPLETED_SCAN_SIZE = 100;

/** GET /apps 对 400 的响应体形状（平台管理员无租户上下文）。 */
interface AppsErrorShape {
  response?: { status?: number; data?: { error?: { message?: string } } };
}

interface AppGroup {
  /** 分组键（未分组 = __ungrouped__） */
  key: string;
  name: string | null;
  apps: AppSummary[];
}

const UNGROUPED_KEY = '__ungrouped__';

export default function Home() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [keyword, setKeyword] = useState('');
  // 视图模式：卡片/列表，localStorage 记忆
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() =>
    localStorage.getItem('apaas:portal.view') === 'list' ? 'list' : 'card',
  );
  const setView = (mode: 'card' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('apaas:portal.view', mode);
  };

  const {
    data: apps,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.apps(),
    queryFn: appsApi.list,
  });

  // 待我审批（任务中心同源）：PENDING 任务
  const { data: pendingTasks } = useQuery({
    queryKey: ['tasks', 'pending', 'home'],
    queryFn: () => tasksApi.list({ status: 'pending', page: 1, pageSize: TODO_STRIP_SIZE }),
  });
  // 已办（本月）：客户端按 completedAt 过滤
  const { data: completedTasks } = useQuery({
    queryKey: ['tasks', 'completed', 'home'],
    queryFn: () => tasksApi.list({ status: 'completed', page: 1, pageSize: COMPLETED_SCAN_SIZE }),
  });

  const isPlatformAdmin = user?.isPlatformAdmin ?? false;
  const errBody = (error as AppsErrorShape | null)?.response;
  const noTenantContext =
    isPlatformAdmin ||
    (errBody?.status === 400 && /平台管理员/.test(errBody?.data?.error?.message ?? ''));

  const visibleApps = useMemo(
    () => (apps ?? []).filter((a: AppSummary) => a.status === 'PUBLISHED'),
    [apps],
  );

  const groups: AppGroup[] = useMemo(() => {
    const map = new Map<string, AppSummary[]>();
    for (const app of visibleApps) {
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
  }, [visibleApps]);

  const keywordTrim = keyword.trim().toLowerCase();
  const visibleGroups: AppGroup[] = useMemo(() => {
    if (!keywordTrim) return groups;
    return groups
      .map((g) => ({
        ...g,
        apps: g.apps.filter(
          (a) =>
            a.name.toLowerCase().includes(keywordTrim) ||
            (a.description ?? '').toLowerCase().includes(keywordTrim),
        ),
      }))
      .filter((g) => g.apps.length > 0);
  }, [groups, keywordTrim]);

  const listApps = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return visibleApps;
    return visibleApps.filter(
      (a) => a.name.toLowerCase().includes(kw) || (a.description ?? '').toLowerCase().includes(kw),
    );
  }, [visibleApps, keyword]);

  const totalVisible = visibleGroups.reduce((sum, g) => sum + g.apps.length, 0);
  /** 只读定位轨：分组 ≥2 才出现；空组不显示（groups 本就只含有应用的组）。 */
  const showRail = groups.length >= 2;

  const month = new Date().getMonth();
  const completedThisMonth = (completedTasks?.items ?? []).filter((t) => {
    if (!t.completedAt) return false;
    return new Date(t.completedAt).getMonth() === month;
  }).length;

  const pendingTotal = pendingTasks?.total ?? 0;
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div
      style={{
        maxWidth: 1240,
        margin: '0 auto',
        padding: '36px 40px 40px',
        display: 'flex',
        gap: 48,
        alignItems: 'start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 问候 + 搜索 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div>
            <Title level={3} style={{ fontSize: 25, margin: 0 }}>
              {greeting}，{user?.name ?? '用户'}
            </Title>
            <Text type="secondary" style={{ display: 'block', fontSize: 13.5, marginTop: 6 }}>
              {pendingTotal > 0 ? `今天有 ${pendingTotal} 件审批等待您处理 · ` : ''}共{' '}
              {visibleApps.length} 个应用可用
            </Text>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <Segmented
              value={viewMode}
              onChange={(v) => setView(v as 'card' | 'list')}
              aria-label="视图切换"
              options={[
                { value: 'card', title: '卡片视图', icon: <AppstoreOutlined /> },
                { value: 'list', title: '列表视图', icon: <UnorderedListOutlined /> },
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: T.colorTextQuaternary }} />}
              placeholder="搜索应用名称、描述…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 280, height: 38 }}
            />
          </div>
        </div>

        {/* 审批待办条 */}
        {pendingTotal > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: T.colorPrimaryBg,
              border: `1px solid ${T.colorPrimaryBorder}`,
              borderRadius: 10,
              padding: '12px 16px',
              marginTop: 22,
            }}
          >
            <div
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: T.colorBgContainer,
                border: `1px solid ${T.colorPrimaryBorder}`,
                color: T.colorPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              批
            </div>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 13.5 }}>
                {pendingTotal} 件审批等待您处理
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {(pendingTasks?.items ?? [])
                  .slice(0, 2)
                  .map((t) => `「${t.taskName ?? '审批'}」`)
                  .join(' ')}
              </Text>
            </div>
            <Button
              type="link"
              onClick={() => navigate('/tasks')}
              style={{ marginLeft: 'auto', fontWeight: 600, flexShrink: 0 }}
            >
              去任务中心 →
            </Button>
          </div>
        )}

        {/* 业务指标行 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderTop: `1px solid ${T.colorBorderSecondary}`,
            borderBottom: `1px solid ${T.colorBorderSecondary}`,
            padding: '13px 4px',
            marginTop: 14,
          }}
        >
          <div style={{ padding: '0 28px 0 0' }}>
            <span style={{ fontSize: 21, fontWeight: 600, color: T.colorPrimary }}>
              {pendingTotal}
            </span>
            <span style={{ fontSize: 12, color: T.colorTextQuaternary, marginLeft: 7 }}>
              待我审批
            </span>
          </div>
          <div
            style={{
              padding: '0 28px',
              borderLeft: `1px solid ${T.colorSplit}`,
            }}
          >
            <span style={{ fontSize: 21, fontWeight: 600 }}>{completedThisMonth}</span>
            <span style={{ fontSize: 12, color: T.colorTextQuaternary, marginLeft: 7 }}>
              本月已办结
            </span>
          </div>
        </div>

        {/* 分组只读分节 */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Spin size="large" />
          </div>
        ) : noTenantContext ? (
          <div style={{ marginTop: 30 }}>
            <Empty description="平台管理员无租户上下文，请以租户账号登录运行时">
              <Button
                type="primary"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                返回登录
              </Button>
            </Empty>
          </div>
        ) : error ? (
          <div style={{ marginTop: 30 }}>
            <Empty description="应用列表加载失败，请稍后重试">
              <Button onClick={() => void refetch()}>重试</Button>
            </Empty>
          </div>
        ) : visibleApps.length === 0 ? (
          <div style={{ marginTop: 30 }}>
            <Empty description="暂无可用应用">
              <Button onClick={() => void refetch()}>刷新</Button>
            </Empty>
          </div>
        ) : viewMode === 'list' ? (
          listApps.length === 0 ? (
            <div style={{ marginTop: 30 }}>
              <Empty description={`没有匹配「${keyword.trim()}」的应用`} />
            </div>
          ) : (
            <PortalListView apps={listApps} onOpen={(app) => navigate(`/app/${app.id}`)} />
          )
        ) : totalVisible === 0 ? (
          <div style={{ marginTop: 30 }}>
            <Empty description={`没有匹配「${keyword.trim()}」的应用`} />
          </div>
        ) : (
          visibleGroups.map((g) => (
            <section
              key={g.key}
              data-group-anchor={g.key}
              style={{ paddingTop: 30, scrollMarginTop: 76 }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
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
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 16,
                }}
              >
                {g.apps.map((app) => (
                  <PortalAppCard key={app.id} app={app} onOpen={() => navigate(`/app/${app.id}`)} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* 只读分组定位轨：仅卡片视图显示（与 studio 一致），分组 ≥2 才出现 */}
      {viewMode === 'card' &&
        showRail &&
        !isLoading &&
        !noTenantContext &&
        !error &&
        visibleApps.length > 0 && (
          <PortalGroupRail groups={visibleGroups} total={visibleApps.length} />
        )}
    </div>
  );
}
