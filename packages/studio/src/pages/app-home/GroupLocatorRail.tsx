/**
 * 应用库右轨 — 分组定位器（素蓝首页 v8.1，2026-10-13）。
 *
 * 只服务应用：全部应用 + 各分组（计数右对齐）+ 组内应用叶子。
 * - 选中态 = 直角色带（无圆角）+ 2px 蓝色左指示线；键位用 key 消歧
 *   （null 不再同时代表「全部」与「未分组」——修复双选中 bug）。
 * - 点击 = 平滑滚动定位到对应分节 + 设为当前；滚动跟随高亮（scrollspy）。
 */

import { useEffect, useMemo } from 'react';
import { Typography } from 'antd';
import { TOKENS as T } from '@apaas/shared/design';
import type { AppSummary } from '../../api/apps.js';

const { Text } = Typography;

/** 全部应用的哨兵键（与分组键位空间隔离，修复 null 双选中）。 */
export const RAIL_ALL_KEY = '__all__';
/** 未分组哨兵键。 */
export const UNGROUPED_KEY = '__ungrouped__';

export interface AppGroup {
  /** 分组键（未分组 = __ungrouped__） */
  key: string;
  /** 分组名；null = 未分组（展示为「未分组」） */
  name: string | null;
  apps: AppSummary[];
}

interface GroupLocatorRailProps {
  groups: AppGroup[];
  /** 当前定位的分组键（__all__ = 全部） */
  activeKey: string;
  /** 仅设状态（scrollspy 回调也走这里，禁止触发滚动） */
  onSelect: (key: string) => void;
}

/** 分组键 → DOM 锚点（与正文分节 data-group-anchor 一致）。 */
export function groupAnchorId(key: string): string {
  return `group-anchor-${key}`;
}

export default function GroupLocatorRail({ groups, activeKey, onSelect }: GroupLocatorRailProps) {
  const total = useMemo(() => groups.reduce((sum, g) => sum + g.apps.length, 0), [groups]);

  // scrollspy：滚动时把最接近视口顶部的分节设为当前（键位来自 data-group-anchor）
  useEffect(() => {
    const onScroll = () => {
      const sections = document.querySelectorAll<HTMLElement>('[data-group-anchor]');
      let current = RAIL_ALL_KEY;
      sections.forEach((sec) => {
        if (sec.getBoundingClientRect().top <= 160) {
          current = sec.dataset.groupAnchor ?? RAIL_ALL_KEY;
        }
      });
      if (current !== activeKey) onSelect(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeKey, onSelect]);

  return (
    <div
      style={{
        width: 248,
        flexShrink: 0,
        position: 'sticky',
        top: 84,
        alignSelf: 'start',
        paddingTop: 6,
      }}
    >
      <Text
        style={{
          display: 'block',
          fontSize: 11.5,
          letterSpacing: '0.14em',
          color: T.colorTextQuaternary,
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        分 组
      </Text>
      <RailRow
        label="全部应用"
        count={total}
        indent={0}
        active={activeKey === RAIL_ALL_KEY}
        onLocate={() => {
          onSelect(RAIL_ALL_KEY);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      {groups.map((g) => (
        <div key={g.key}>
          <RailRow
            label={g.name ?? '未分组'}
            count={g.apps.length}
            indent={14}
            active={activeKey === g.key}
            onLocate={() => {
              onSelect(g.key);
              document
                .querySelector(`[data-group-anchor="${g.key}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
          {g.apps.map((app) => (
            <div
              key={app.id}
              style={{
                fontSize: 12.5,
                color: T.colorTextTertiary,
                padding: '3.5px 0 3.5px 32px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'default',
              }}
            >
              {app.name}
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: T.colorTextQuaternary, paddingTop: 8 }}>
        点击分组快速定位
      </div>
    </div>
  );
}

/** 直角色带行：无圆角；选中 = 色带铺满轨宽 + 2px 蓝色左指示线；悬停浅灰。 */
function RailRow({
  label,
  count,
  indent,
  active,
  onLocate,
}: {
  label: string;
  count: number;
  indent: number;
  active: boolean;
  onLocate: () => void;
}) {
  return (
    <div
      onClick={onLocate}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        fontSize: label === '全部应用' ? 13.5 : 13,
        fontWeight: active ? 600 : 500,
        color: active ? T.colorText : T.colorTextSecondary,
        background: active ? T.colorFillTertiary : 'transparent',
        borderLeft: `2px solid ${active ? T.colorPrimary : 'transparent'}`,
        borderRadius: 0,
        paddingLeft: 10,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = T.colorFillQuaternary;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingLeft: indent,
        }}
      >
        {label}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: active ? T.colorTextSecondary : T.colorTextQuaternary,
          fontWeight: 400,
        }}
      >
        {count}
      </span>
    </div>
  );
}
