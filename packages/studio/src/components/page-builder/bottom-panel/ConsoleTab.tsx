/**
 * 底部面板「控制台」页签 — 对齐飞书：级别过滤（错误/成功/警告/信息 + 计数）、
 * 展示时间戳开关、清空、REPL 输入行（执行表达式并记录输出）。
 */

import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Typography } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import {
  filterLogs,
  useDebugStore,
  type ConsoleLogEntry,
  type DebugLogLevel,
} from '../../../stores/page-builder/debug.js';

const { Text } = Typography;

const LEVEL_META: { key: DebugLogLevel; label: string; color: string }[] = [
  { key: 'error', label: '错误', color: '#f54a45' },
  { key: 'success', label: '成功', color: '#34c724' },
  { key: 'warn', label: '警告', color: '#ff8800' },
  { key: 'info', label: '信息', color: '#1456f0' },
];

const LEVEL_TEXT_COLOR: Record<DebugLogLevel, string> = {
  error: '#f54a45',
  success: '#34c724',
  warn: '#ff8800',
  info: 'rgba(0,0,0,0.88)',
};

/** 控制台页签主组件。 */
export default function ConsoleTab() {
  const logs = useDebugStore((s) => s.logs);
  const clearLogs = useDebugStore((s) => s.clearLogs);
  const pushLog = useDebugStore((s) => s.pushLog);
  const [enabled, setEnabled] = useState<Set<DebugLogLevel>>(new Set());
  const [showTime, setShowTime] = useState(false);
  const [code, setCode] = useState('');

  const counts = useMemo(() => {
    const map = new Map<DebugLogLevel, number>();
    for (const l of logs) map.set(l.level, (map.get(l.level) ?? 0) + 1);
    return map;
  }, [logs]);

  const visible = useMemo(() => filterLogs(logs, enabled), [logs, enabled]);

  const toggleLevel = (level: DebugLogLevel) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const runCode = () => {
    const expr = code.trim();
    if (!expr) return;
    pushLog('info', `> ${expr}`);
    try {
      // 调试 REPL：仅预览态开发者手动触发，表达式在严格模式函数中求值
      const fn = new Function(`"use strict"; return (${expr});`);
      const result = fn();
      pushLog('success', result === undefined ? 'undefined' : String(result));
    } catch (err) {
      pushLog('error', err instanceof Error ? err.message : String(err));
    }
    setCode('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 过滤条 */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 16px',
          borderBottom: '1px solid #f2f3f5',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          过滤条件
        </Text>
        {LEVEL_META.map((meta) => (
          <Checkbox
            key={meta.key}
            checked={enabled.has(meta.key)}
            onChange={() => toggleLevel(meta.key)}
            style={{ fontSize: 12 }}
          >
            <span style={{ color: meta.color }}>
              {meta.label} {counts.get(meta.key) ?? 0}
            </span>
          </Checkbox>
        ))}
        <Checkbox
          checked={showTime}
          onChange={(e) => setShowTime(e.target.checked)}
          style={{ fontSize: 12 }}
        >
          展示时间戳
        </Checkbox>
        <div style={{ flex: 1 }} />
        <Button
          type="text"
          size="small"
          icon={<ClearOutlined />}
          onClick={clearLogs}
          title="清空控制台"
        />
      </div>

      {/* 日志流 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px', minHeight: 0 }}>
        {visible.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            暂无日志（预览态操作或下方输入表达式后在此输出）
          </Text>
        ) : (
          visible.map((log) => <LogRow key={log.id} log={log} showTime={showTime} />)
        )}
      </div>

      {/* REPL 输入行 */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
        }}
      >
        <Text style={{ color: '#1456f0', fontFamily: 'monospace', fontSize: 13 }}>&gt;</Text>
        <Input
          size="small"
          variant="borderless"
          placeholder="输入表达式回车执行，如 vm.record 或 1 + 1"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onPressEnter={runCode}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </div>
    </div>
  );
}

function LogRow({ log, showTime }: { log: ConsoleLogEntry; showTime: boolean }) {
  const time = showTime ? new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false }) : null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '2px 0', alignItems: 'baseline' }}>
      {time && (
        <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
          {time}
        </Text>
      )}
      <Text
        style={{
          fontSize: 12,
          fontFamily: 'monospace',
          color: LEVEL_TEXT_COLOR[log.level],
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {log.message}
      </Text>
    </div>
  );
}
