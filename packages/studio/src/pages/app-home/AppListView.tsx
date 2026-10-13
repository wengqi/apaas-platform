/**
 * 开发中心首页 — 列表视图（素蓝，2026-10-13）。
 *
 * 高密度列表：一屏 ~10 个应用，信息列全展开（应用/分组/状态/版本/资源/更新/操作）。
 * 行点击进入应用工作台；⋯ 菜单与卡片视图同源。
 */

import { Dropdown, Typography } from 'antd';
import { TOKENS as T } from '@apaas/shared/design';
import type { MenuProps } from 'antd';
import type { AppSummary } from '../../api/apps.js';
import { formatTime } from './home-bits.js';

const { Text } = Typography;

interface AppListViewProps {
  apps: AppSummary[];
  menuItemsFor: (app: AppSummary) => MenuProps['items'];
  onMenuClick: (app: AppSummary, info: { key: string }) => void;
  onOpen: (app: AppSummary) => void;
  /** 筛选提示（当前分组过滤时显示） */
  filterHint?: string;
}

const GRID = 'minmax(240px, 1.7fr) 104px 96px 60px minmax(140px, 1fr) 96px 36px';

export default function AppListView({
  apps,
  menuItemsFor,
  onMenuClick,
  onOpen,
  filterHint,
}: AppListViewProps) {
  const rowKeyDown = (e: React.KeyboardEvent, app: AppSummary) => {
    if (e.key === 'Enter') onOpen(app);
  };

  return (
    <div style={{ marginTop: 20, overflowX: 'auto' }}>
      <div style={{ minWidth: 860 }}>
        {/* 列头 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            gap: 12,
            alignItems: 'center',
            padding: '0 12px',
            height: 34,
            fontSize: 11.5,
            letterSpacing: '0.06em',
            color: T.colorTextTertiary,
            fontWeight: 600,
            borderBottom: `1px solid ${T.colorBorderSecondary}`,
          }}
        >
          <span>应 用</span>
          <span>分 组</span>
          <span>状 态</span>
          <span>版 本</span>
          <span>资 源</span>
          <span>更 新</span>
          <span />
        </div>
        {/* 行 */}
        {apps.map((app) => (
          <div
            key={app.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(app)}
            onKeyDown={(e) => rowKeyDown(e, app)}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 12,
              alignItems: 'center',
              padding: '9px 12px',
              borderBottom: `1px solid ${T.colorSplit}`,
              background: T.colorBgContainer,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.colorFillQuaternary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = T.colorBgContainer;
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <div
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: T.colorPrimary,
                  color: T.colorWhite,
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {(app.name || '应').slice(0, 1)}
              </div>
              <div style={{ minWidth: 0 }}>
                <Text strong style={{ fontSize: 13.5, display: 'block' }} ellipsis>
                  {app.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                  {app.apiName}
                </Text>
              </div>
            </div>
            <Text style={{ fontSize: 12.5, color: T.colorTextSecondary }}>
              {app.group ?? '未分组'}
            </Text>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                color: T.colorTextSecondary,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: app.status === 'PUBLISHED' ? T.colorPrimary : T.colorDotIdle,
                  flexShrink: 0,
                }}
              />
              {app.status === 'PUBLISHED' ? '已发布' : '开发中'}
            </span>
            <Text style={{ fontSize: 12.5, color: T.colorTextSecondary }}>v{app.version}</Text>
            <Text style={{ fontSize: 12, color: T.colorTextTertiary }}>
              {app.stats.objects} 对象 · {app.stats.pages} 页面 · {app.stats.processes} 流程
            </Text>
            <Text style={{ fontSize: 12.5, color: T.colorTextTertiary }}>
              {formatTime(app.updatedAt)}
            </Text>
            <Dropdown
              menu={{
                items: menuItemsFor(app),
                onClick: (info) => {
                  info.domEvent?.stopPropagation();
                  onMenuClick(app, info);
                },
              }}
              placement="bottomRight"
              trigger={['click']}
            >
              <span
                role="button"
                tabIndex={0}
                aria-label={`应用「${app.name}」更多操作`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}
                style={{
                  color: T.colorTextQuaternary,
                  fontSize: 14,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                ⋯
              </span>
            </Dropdown>
          </div>
        ))}
        {filterHint && (
          <div style={{ padding: '14px 12px', fontSize: 12.5, color: T.colorTextTertiary }}>
            {filterHint}
          </div>
        )}
      </div>
    </div>
  );
}
