/**
 * 应用库右轨 — 分组定位器（素蓝首页 v8，2026-10-13 定稿）。
 *
 * 只服务应用：全部应用 + 各分组（计数右对齐）+ 组内应用叶子；
 * 点击定位到对应分节（scrollIntoView），滚动跟随高亮（scrollspy）。
 * 不承载任何非应用信息（待办/指标锚点已按用户裁决移除）。
 */

import { useEffect, useMemo, useRef } from 'react';
import { Typography } from 'antd';
import { TOKENS as T } from '@apaas/shared/design';
import type { AppSummary } from '../../api/apps.js';

const { Text } = Typography;

/** 右轨吸顶偏移（头部 60px + 间距）。 */
const LAYOUT_TOP_OFFSET = 84;

export interface AppGroup {
  /** 分组名；null = 未分组 */
  name: string | null;
  apps: AppSummary[];
}

interface GroupLocatorRailProps {
  groups: AppGroup[];
  /** 当前定位的分组（null = 全部） */
  activeGroup: string | null;
  onSelect: (group: string | null) => void;
}

/** 分组名 → DOM 锚点 id（与正文分节 data-group-anchor 一致）。 */
export function groupAnchorId(name: string | null): string {
  return name === null ? 'group-ungrouped' : `group-${name ?? ''}`;
}

export default function GroupLocatorRail({ groups, activeGroup, onSelect }: GroupLocatorRailProps) {
  const total = useMemo(() => groups.reduce((sum, g) => sum + g.apps.length, 0), [groups]);
  const listRef = useRef<HTMLDivElement>(null);

  // scrollspy：滚动时把最接近视口顶部的分节标记为当前组
  useEffect(() => {
    const onScroll = () => {
      const sections = document.querySelectorAll<HTMLElement>('[data-group-anchor]');
      let current: string | null = null;
      sections.forEach((sec) => {
        if (sec.getBoundingClientRect().top <= 160) current = sec.dataset.groupAnchor ?? null;
      });
      if (current !== activeGroup) onSelect(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeGroup, onSelect]);

  return (
    <div
      ref={listRef}
      style={{
        width: 248,
        flexShrink: 0,
        position: 'sticky',
        top: LAYOUT_TOP_OFFSET,
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
        active={activeGroup === null}
        onSelect={() => onSelect(null)}
      />
      {groups.map((g) => (
        <div key={g.name ?? '__ungrouped'}>
          <RailRow
            label={g.name ?? '未分组'}
            count={g.apps.length}
            active={activeGroup === g.name}
            onSelect={() => onSelect(g.name)}
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
      <div
        style={{
          fontSize: 11.5,
          color: T.colorTextQuaternary,
          paddingTop: 8,
        }}
      >
        点击分组快速定位
      </div>
    </div>
  );
}

function RailRow({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: (group: string | null) => void;
}) {
  return (
    <div
      onClick={() => onSelect(label === '全部应用' ? null : label)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        fontSize: label === '全部应用' ? 13.5 : 13,
        fontWeight: active ? 600 : 500,
        color: active ? T.colorText : T.colorTextSecondary,
        background: active ? T.colorFillTertiary : 'transparent',
        borderLeft: `2px solid ${active ? T.colorPrimary : 'transparent'}`,
        margin: '2px 0 2px 2px',
        padding: label === '全部应用' ? '4px 8px 4px 0' : '4px 8px 4px 14px',
        cursor: 'pointer',
        borderRadius: active ? 6 : undefined,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
