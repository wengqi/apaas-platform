/**
 * 底部调试面板 — 对齐飞书 aPaaS：错误检查(n) / 控制台 / 请求时间轴 / 性能(n) / 更多。
 * 错误检查 = schema 静态检查（utils/schema-issues），条目点击选中对应组件。
 */

import { useMemo } from 'react';
import { Empty, Tag, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { useDebugStore, type DebugTab } from '../../stores/page-builder/debug.js';
import { collectSchemaIssues } from '../../utils/schema-issues.js';
import ConsoleTab from './bottom-panel/ConsoleTab.js';
import { TimelineTab, PerfTab, MoreTab } from './bottom-panel/TimelinePerfTabs.js';

const { Text } = Typography;

const PANEL_HEIGHT = 220;

/** 底部调试面板主组件（挂载于 PageBuilder 三栏之下）。 */
export default function BottomPanel() {
  const schema = usePageBuilderStore((s) => s.schema);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const panelOpen = useDebugStore((s) => s.panelOpen);
  const tab = useDebugStore((s) => s.tab);
  const setTab = useDebugStore((s) => s.setTab);
  const togglePanel = useDebugStore((s) => s.togglePanel);

  const issues = useMemo(() => collectSchemaIssues(schema), [schema]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.length - errorCount;

  if (!panelOpen) return null;

  const tabs: { key: DebugTab; label: string }[] = [
    { key: 'errors', label: `错误检查(${issues.length})` },
    { key: 'console', label: '控制台' },
    { key: 'timeline', label: '请求时间轴' },
    { key: 'perf', label: `性能(${warnCount})` },
    { key: 'more', label: '更多' },
  ];

  return (
    <div
      style={{
        flexShrink: 0,
        height: PANEL_HEIGHT,
        background: '#fff',
        borderTop: '1px solid #e5e6eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 页签条 */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: '1px solid #f2f3f5',
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              userSelect: 'none',
              color: tab === t.key ? '#1456f0' : 'rgba(0,0,0,0.65)',
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: `2px solid ${tab === t.key ? '#1456f0' : 'transparent'}`,
            }}
          >
            {t.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <Text
          onClick={() => togglePanel(false)}
          style={{ cursor: 'pointer', fontSize: 16, color: 'rgba(0,0,0,0.45)', padding: '0 4px' }}
        >
          ✕
        </Text>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tab === 'errors' && (
          <IssuesList issues={issues} onSelect={(nodeId) => selectNode(nodeId)} />
        )}
        {tab === 'console' && <ConsoleTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'perf' && <PerfTab />}
        {tab === 'more' && <MoreTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 错误检查列表
// ---------------------------------------------------------------------------

function IssuesList({
  issues,
  onSelect,
}: {
  issues: ReturnType<typeof collectSchemaIssues>;
  onSelect: (nodeId: string) => void;
}) {
  if (issues.length === 0) {
    return (
      <div style={{ padding: '8px 0' }}>
        <Empty
          image={<CheckCircleFilled style={{ fontSize: 48, color: '#34c724' }} />}
          description={<Text type="secondary">未发现问题，页面检查通过</Text>}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 16px' }}>
      {issues.map((issue) => (
        <div
          key={issue.id}
          onClick={() => issue.nodeId && onSelect(issue.nodeId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 4,
            cursor: issue.nodeId ? 'pointer' : 'default',
          }}
          onMouseEnter={(e) => {
            if (issue.nodeId) e.currentTarget.style.background = '#f2f3f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Tag color={issue.severity === 'error' ? 'error' : 'warning'} style={{ margin: 0 }}>
            {issue.severity === 'error' ? '错误' : '警告'}
          </Tag>
          <Text style={{ fontSize: 13 }}>{issue.message}</Text>
        </div>
      ))}
    </div>
  );
}
