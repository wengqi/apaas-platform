/**
 * runtime 门户 — 列表视图（素蓝，2026-10-13）。
 *
 * 业务面高密度列表：应用（瓷片+名称+业务描述单行）/ 分组 / 版本·维护者 / 进入。
 * 无状态列、无工程计数（业务面口径，与卡片视图一致）。
 */

import { Typography } from 'antd';
import { TOKENS as T } from '@apaas/shared/design';
import type { AppSummary } from '../api/apps';

const { Text } = Typography;

interface PortalListViewProps {
  apps: AppSummary[];
  onOpen: (app: AppSummary) => void;
}

const GRID = 'minmax(260px, 1.8fr) 110px 150px 80px';

export default function PortalListView({ apps, onOpen }: PortalListViewProps) {
  return (
    <div style={{ marginTop: 20, overflowX: 'auto' }}>
      <div style={{ minWidth: 640 }}>
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
          <span>版 本 · 维护者</span>
          <span />
        </div>
        {apps.map((app) => (
          <div
            key={app.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(app)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(app);
            }}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 12,
              alignItems: 'center',
              padding: '10px 12px',
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
                  {app.description || '暂无描述'}
                </Text>
              </div>
            </div>
            <Text style={{ fontSize: 12.5, color: T.colorTextSecondary }}>
              {app.group ?? '未分组'}
            </Text>
            <Text style={{ fontSize: 12.5, color: T.colorTextTertiary }}>
              {app.version ? `v${app.version}` : ''}
              {app.ownerName ? ` · ${app.ownerName}` : ''}
            </Text>
            <span
              style={{
                fontSize: 12.5,
                color: T.colorPrimary,
                fontWeight: 600,
                textAlign: 'right',
              }}
            >
              进入 →
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
