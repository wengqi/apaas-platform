/**
 * 运行时门户右轨 — 分组定位器（只读，素蓝 2026-10-13）。
 *
 * 与 studio GroupLocatorRail 同一修复逻辑（2026-10-13 移植）：
 * - 选中状态由本组件内化：点击 = 定位滚动 + 选中；scrollspy 仅跟随高亮，
 *   绝不触发滚动（studio 曾因 spy 回调经父级触发滚动，与点击/用户滚动互相
 *   打架——点击落定错误分组 + 滚动卡顿）。
 * - 点击后压制 spy（滚动静默 150ms 解除、3s 硬上限；用户滚轮/触摸立即交还）；
 *   滚到底收敛到最后分组（底部分节可能永远达不到判定线）；rAF 每帧最多测量一次。
 * - 分组名（用户数据）进选择器前过 CSS.escape。
 * 视觉与 studio v8.2 对齐（2026-10-13）：无「全部应用」行，应用总数在
 * 「分 组」头行右对齐展示，交互提示吸附轨底，分组行与头行左对齐。
 */

import { useEffect, useRef, useState } from 'react';
import { Typography } from 'antd';
import { TOKENS as T } from '@apaas/shared/design';
import type { AppSummary } from '../api/apps';

const { Text } = Typography;

/** 全部应用哨兵键。 */
export const RAIL_ALL_KEY = '__all__';

/** spy 判定线：分节顶边越过视口顶部该偏移即视为「已读入」。 */
const SPY_LINE_OFFSET_PX = 160;
/** 点击定位后压制 scrollspy 的硬上限（平滑滚动时长随距离变化，静默解锁为主、此为兜底）。 */
const SPY_LOCK_MAX_MS = 3000;
/** 滚动静默该时长即视为定位滚动已落定，解除 spy 压制。 */
const SPY_SETTLE_QUIET_MS = 150;
/** 判定「已滚动到底」的容差（px）。 */
const BOTTOM_TOLERANCE_PX = 2;

export interface PortalAppGroup {
  /** 分组键（未分组 = __ungrouped__） */
  key: string;
  name: string | null;
  apps: AppSummary[];
}

interface PortalGroupRailProps {
  /** 渲染分组（与正文分节同源，搜索时传过滤后的分组，保证点击必有落点） */
  groups: PortalAppGroup[];
  /** 「全部应用」行计数（可见应用总数） */
  total: number;
}

export default function PortalGroupRail({ groups, total }: PortalGroupRailProps) {
  const [activeKey, setActiveKey] = useState(RAIL_ALL_KEY);
  /** spy 压制截止时间戳：0 = 未压制。 */
  const spyLockUntilRef = useRef(0);
  /** 滚动静默解锁定时器（定位滚动落定检测）。 */
  const spyQuietTimerRef = useRef(0);

  const unlockSpy = () => {
    spyLockUntilRef.current = 0;
    window.clearTimeout(spyQuietTimerRef.current);
  };

  const locate = (key: string) => {
    spyLockUntilRef.current = Date.now() + SPY_LOCK_MAX_MS;
    window.clearTimeout(spyQuietTimerRef.current);
    setActiveKey(key);
    document
      .querySelector(`[data-group-anchor="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // scrollspy：滚动时把最接近视口顶部的分节设为当前（键位来自 data-group-anchor）。
  // 只改高亮、绝不触发滚动；定位滚动期间压制、落定后恢复跟随。
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      if (Date.now() < spyLockUntilRef.current) return;
      const doc = document.documentElement;
      const anchors = document.querySelectorAll<HTMLElement>('[data-group-anchor]');
      let current: string;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - BOTTOM_TOLERANCE_PX) {
        current = anchors[anchors.length - 1]?.dataset.groupAnchor ?? RAIL_ALL_KEY;
      } else {
        current = RAIL_ALL_KEY;
        for (const sec of anchors) {
          if (sec.getBoundingClientRect().top > SPY_LINE_OFFSET_PX) break;
          current = sec.dataset.groupAnchor ?? RAIL_ALL_KEY;
        }
      }
      setActiveKey((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (Date.now() < spyLockUntilRef.current) {
        // 定位滚动进行中：滚动静默后解除压制（期间不测量、不与平滑滚动竞争）
        window.clearTimeout(spyQuietTimerRef.current);
        spyQuietTimerRef.current = window.setTimeout(unlockSpy, SPY_SETTLE_QUIET_MS);
        return;
      }
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', unlockSpy, { passive: true });
    window.addEventListener('touchmove', unlockSpy, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', unlockSpy);
      window.removeEventListener('touchmove', unlockSpy);
      window.clearTimeout(spyQuietTimerRef.current);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        position: 'sticky',
        top: 84,
        alignSelf: 'start',
        paddingTop: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
        <Text
          style={{
            display: 'block',
            fontSize: 11.5,
            letterSpacing: '0.14em',
            color: T.colorTextQuaternary,
            fontWeight: 600,
          }}
        >
          分 组
        </Text>
        <Text style={{ marginLeft: 'auto', fontSize: 11, color: T.colorTextQuaternary }}>
          {total} 个应用
        </Text>
      </div>
      {groups.map((g) => (
        <div key={g.key}>
          <RailRow
            label={g.name ?? '未分组'}
            count={g.apps.length}
            active={activeKey === g.key}
            onLocate={() => locate(g.key)}
          />
          {g.apps.map((app) => (
            <div
              key={app.id}
              style={{
                fontSize: 12.5,
                color: T.colorTextTertiary,
                padding: '3.5px 0 3.5px 20px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {app.name}
            </div>
          ))}
        </div>
      ))}
      {/* 交互提示：吸附在轨道可视底部——长列表时提示不再吊在内容末端不可见 */}
      <div
        style={{
          position: 'sticky',
          bottom: 8,
          marginTop: 8,
          paddingTop: 8,
          background: T.colorBgLayout,
          fontSize: 11.5,
          color: T.colorTextQuaternary,
        }}
      >
        点击分组快速定位
      </div>
    </aside>
  );
}

/** 直角色带行：无圆角；选中 = 色带铺满轨宽 + 2px 蓝色左指示线；悬停浅灰。 */
function RailRow({
  label,
  count,
  active,
  onLocate,
}: {
  label: string;
  count: number;
  active: boolean;
  onLocate: () => void;
}) {
  return (
    <div
      onClick={onLocate}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        fontSize: 13,
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
