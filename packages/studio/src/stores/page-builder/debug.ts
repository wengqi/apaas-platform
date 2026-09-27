/**
 * 底部调试面板状态 — 控制台日志 / 请求时间轴 / 面板页签。
 *
 * 对齐飞书 aPaaS 底部面板（错误检查/控制台/请求时间轴/性能/更多）。
 * 日志与请求由预览运行时（RuntimeStore adapter 包装）推入，上限 200 条防泄漏。
 */

import { create } from 'zustand';

export type DebugLogLevel = 'error' | 'warn' | 'success' | 'info';

export interface ConsoleLogEntry {
  id: number;
  level: DebugLogLevel;
  /** 时间戳（ms），展示时间戳开关用 */
  time: number;
  message: string;
}

export interface RequestEntry {
  id: number;
  time: number;
  method: string;
  url: string;
  status: 'pending' | 'ok' | 'error';
  durationMs?: number;
}

export type DebugTab = 'errors' | 'console' | 'timeline' | 'perf' | 'more';

/** 日志/请求上限（防长时间预览泄漏内存）。 */
export const MAX_DEBUG_ENTRIES = 200;

interface DebugState {
  panelOpen: boolean;
  tab: DebugTab;
  logs: ConsoleLogEntry[];
  requests: RequestEntry[];
  /** 预览态运行时 vm 快照（null = 非预览态；由 RuntimeVmBridge 同步） */
  runtimeVm: Record<string, unknown> | null;
  /** 自增 id（日志与请求共用计数器） */
  nextId: number;

  togglePanel: (open?: boolean) => void;
  setTab: (tab: DebugTab) => void;
  pushLog: (level: DebugLogLevel, message: string) => void;
  clearLogs: () => void;
  /** 开始一条请求，返回其 id（完成后调 completeRequest） */
  beginRequest: (method: string, url: string) => number;
  completeRequest: (id: number, ok: boolean, durationMs: number) => void;
  setRuntimeVm: (vm: Record<string, unknown> | null) => void;
}

let seq = 0;
const nextSeq = () => ++seq;

export const useDebugStore = create<DebugState>((set) => ({
  panelOpen: true,
  tab: 'console',
  logs: [],
  requests: [],
  runtimeVm: null,
  nextId: 1,

  togglePanel: (open) => set((s) => ({ panelOpen: open ?? !s.panelOpen })),
  setTab: (tab) => set({ tab, panelOpen: true }),

  pushLog: (level, message) =>
    set((s) => ({
      logs: [
        ...s.logs.slice(-(MAX_DEBUG_ENTRIES - 1)),
        { id: nextSeq(), level, time: Date.now(), message },
      ],
    })),
  clearLogs: () => set({ logs: [] }),

  beginRequest: (method, url) => {
    const id = nextSeq();
    set((s) => ({
      requests: [
        ...s.requests.slice(-(MAX_DEBUG_ENTRIES - 1)),
        { id, time: Date.now(), method, url, status: 'pending' },
      ],
    }));
    return id;
  },
  completeRequest: (id, ok, durationMs) =>
    set((s) => ({
      requests: s.requests.map((r) =>
        r.id === id ? { ...r, status: ok ? 'ok' : 'error', durationMs } : r,
      ),
    })),
  setRuntimeVm: (vm) => set({ runtimeVm: vm }),
}));

/** 按级别过滤日志（level 集合为空时返回全部）。 */
export function filterLogs(
  logs: ConsoleLogEntry[],
  levels: ReadonlySet<DebugLogLevel>,
): ConsoleLogEntry[] {
  if (levels.size === 0) return logs;
  return logs.filter((l) => levels.has(l.level));
}
