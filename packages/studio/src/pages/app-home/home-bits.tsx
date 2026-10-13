/**
 * 开发中心首页展示件（素蓝 v8）：治理待办条 / 关键指标行 / 最近动态。
 * 纯展示组件——数据由 DevCenterHome 通过 props 注入。
 */

import { Button, Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { TOKENS as T } from '@apaas/shared/design';

const { Text, Title } = Typography;

/** 待审汇总（reviewsApi.pendingSummary 返回的 items 单项）。 */
export interface PendingAppItem {
  appId: string;
  appName: string;
  count: number;
  latest: { module: string; apiName: string; name: string; createdAt: string } | null;
}

/** 治理待办条（有待审才渲染）。 */
export function TodoStrip({
  total,
  items,
  onGoReview,
}: {
  total: number;
  items: PendingAppItem[];
  onGoReview: () => void;
}) {
  if (total <= 0) return null;
  return (
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
        审
      </div>
      <div style={{ minWidth: 0 }}>
        <Text strong style={{ fontSize: 13.5 }}>
          {total} 个提交等待您审核
        </Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {items
            .slice(0, 2)
            .map(
              (i) =>
                `「${i.appName}」${i.latest?.name ?? ''}${i.count > 1 ? ` 等 ${i.count} 件` : ''}`,
            )
            .join(' · ')}
        </Text>
      </div>
      <Button
        type="link"
        onClick={onGoReview}
        style={{ marginLeft: 'auto', fontWeight: 600, flexShrink: 0 }}
      >
        去审核中心 →
      </Button>
    </div>
  );
}

/** 关键指标行（纯文字 + 发丝分隔，素净无卡壳）。 */
export function KpiRow({
  appCount,
  running,
  completedToday,
  timedOut,
  pendingTotal,
}: {
  appCount: number;
  running: number;
  completedToday: number;
  timedOut: number;
  pendingTotal: number;
}) {
  const cell = (
    value: number,
    label: string,
    opts?: { first?: boolean; warn?: boolean; link?: boolean },
  ) => (
    <div
      style={{
        padding: opts?.first ? '0 26px 0 0' : '0 26px',
        borderLeft: opts?.first ? undefined : `1px solid ${T.colorSplit}`,
      }}
    >
      <span
        style={{
          fontSize: 21,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: opts?.warn ? T.colorWarningDeep : opts?.link ? T.colorPrimary : T.colorText,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 12, color: T.colorTextQuaternary, marginLeft: 7 }}>{label}</span>
    </div>
  );
  return (
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
      {cell(appCount, '应用', { first: true })}
      {cell(running, '在途流程实例')}
      {cell(completedToday, '今日办结')}
      {cell(timedOut, '超时预警', { warn: true })}
      {cell(pendingTotal, '待我审核', { link: true })}
    </div>
  );
}

/** 审计动态条目（audit-logs API 的 AuditLogItem 子集）。 */
export interface ActivityItem {
  id: string;
  userId: string;
  action: string;
  resource: string | null;
  createdAt: string;
}

/** 最近动态时间线。 */
export function ActivityFeed({
  items,
  nameMap,
  onViewAll,
}: {
  items: ActivityItem[];
  nameMap: Map<string, string>;
  onViewAll: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ paddingTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <Title level={5} style={{ fontSize: 16, margin: 0 }}>
          最近动态
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          全租户搭建活动
        </Text>
        <Button type="link" style={{ marginLeft: 'auto', fontSize: 12.5 }} onClick={onViewAll}>
          查看全部
        </Button>
      </div>
      <div>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '10px 2px',
              borderBottom: `1px solid ${T.colorSplit}`,
              fontSize: 13,
            }}
          >
            <Text strong>{nameMap.get(item.userId) ?? '系统'}</Text>
            <Text type="secondary">
              {item.action}
              {item.resource ? ` · ${item.resource}` : ''}
            </Text>
            <Text
              type="secondary"
              style={{ marginLeft: 'auto', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {formatTime(item.createdAt)}
            </Text>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 紧凑时间：今天=HH:mm / 昨天=昨天 HH:mm / 更早=MM-DD。 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `昨天 ${hm}`;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 统一错误消息提取。 */
export function errMsg(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { message?: string; error?: { message?: string } } };
    message?: string;
  };
  return e.response?.data?.message ?? e.response?.data?.error?.message ?? e.message ?? fallback;
}

/** 卡片视图分组平铺节（含未分组/空组锚点，scrollspy/定位轨共用 data-group-anchor）。 */
export function GroupCardSections({
  groups,
  renderCard,
}: {
  groups: Array<{ key: string; name: string | null; apps: unknown[] }>;
  renderCard: (app: never) => React.ReactNode;
}) {
  return (
    <>
      {groups.map((g) => (
        <section
          key={g.key}
          data-group-anchor={g.key}
          id={`group-anchor-${g.key}`}
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
              <div key={(app as { id: string }).id}>{renderCard(app as never)}</div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** 首页顶部块：问候+搜索 → 治理待办条 → 指标行（素蓝 v8.1）。 */
export function HomeTopBlocks({
  greeting,
  userName,
  appCount,
  groupCount,
  pendingTotal,
  pendingItems,
  keyword,
  onKeywordChange,
  onGoReview,
  analytics,
  children,
}: {
  greeting: string;
  userName: string;
  appCount: number;
  groupCount: number;
  pendingTotal: number;
  pendingItems: PendingAppItem[];
  keyword: string;
  onKeywordChange: (v: string) => void;
  onGoReview: () => void;
  analytics: { totals: { running: number; completed: number; timedOut: number } } | undefined;
  /** 应用库工具行（创建/分组管理/视图切换）由页面注入 */
  children: React.ReactNode;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
        <div>
          <Title level={3} style={{ fontSize: 26, margin: 0 }}>
            {greeting}，{userName}
          </Title>
          <Text type="secondary" style={{ display: 'block', fontSize: 13.5, marginTop: 6 }}>
            共 {appCount} 个应用 · {groupCount} 个分组
            {pendingTotal > 0 ? ` · 今天有 ${pendingTotal} 件提交等待审核` : ''}
          </Text>
        </div>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: T.colorTextQuaternary }} />}
          placeholder="搜索应用名称、描述…"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          style={{ marginLeft: 'auto', width: 320, height: 38, flexShrink: 0 }}
        />
      </div>
      <TodoStrip total={pendingTotal} items={pendingItems} onGoReview={onGoReview} />
      <KpiRow
        appCount={appCount}
        running={analytics?.totals.running ?? 0}
        completedToday={analytics?.totals.completed ?? 0}
        timedOut={analytics?.totals.timedOut ?? 0}
        pendingTotal={pendingTotal}
      />
      <div style={{ paddingTop: 26 }}>{children}</div>
    </>
  );
}

/** 分组筛选芯片条目。 */
export interface GroupChipItem {
  key: string;
  label: string;
  count: number;
}

/**
 * 分组筛选芯片行（双端唯一分组导航机制，替代定位轨）：
 * 全部 + 各分组（带计数）+ 尾部「＋新建分组」幽灵芯片；
 * 选中 = 浅蓝底蓝字（与顶部导航激活态同语言）；素蓝直角无圆弧。
 */
export function GroupFilterChips({
  items,
  activeKey,
  onChange,
  onCreateGroup,
}: {
  items: GroupChipItem[];
  activeKey: string;
  onChange: (key: string) => void;
  onCreateGroup: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 7,
              height: 32,
              padding: '0 13px',
              borderRadius: 0,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? T.colorPrimary : T.colorTextSecondary,
              background: active ? T.colorPrimaryBg : 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = T.colorFillQuaternary;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            {item.label}
            <span
              style={{
                fontSize: 11,
                color: active ? T.colorPrimaryBorder : T.colorTextQuaternary,
                fontWeight: 400,
              }}
            >
              {item.count}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onCreateGroup}
        style={{
          height: 30,
          padding: '0 12px',
          borderRadius: 0,
          border: `1px dashed ${T.colorBorder}`,
          background: 'transparent',
          color: T.colorTextTertiary,
          fontSize: 12.5,
          cursor: 'pointer',
        }}
      >
        ＋ 新建分组
      </button>
    </div>
  );
}
