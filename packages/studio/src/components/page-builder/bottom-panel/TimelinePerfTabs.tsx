/**
 * 底部面板「请求时间轴 / 性能 / 更多」页签。
 *
 * - 请求时间轴：预览态 API 请求（方法/URL/状态/耗时，按时间倒序）
 * - 性能：组件与代码块总数 + 错误检查问题计数 + 空态
 * - 更多：调试工具入口（视图模型面板 / 复制 Schema JSON）
 */

import { useMemo } from 'react';
import { Button, Empty, Tag, Typography } from 'antd';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import type { ComponentNode } from '../../../api/pages.js';
import { useDebugStore } from '../../../stores/page-builder/debug.js';
import { collectSchemaIssues } from '../../../utils/schema-issues.js';

const { Text } = Typography;

/** 请求时间轴页签。 */
export function TimelineTab() {
  const requests = useDebugStore((s) => s.requests);

  if (requests.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无请求（预览态触发数据请求后在此展示）"
        style={{ paddingTop: 24 }}
      />
    );
  }

  const ordered = [...requests].reverse();
  return (
    <div style={{ padding: '8px 16px' }}>
      {ordered.map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 0',
            borderBottom: '1px solid #f7f8fa',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
            {new Date(r.time).toLocaleTimeString('zh-CN', { hour12: false })}
          </Text>
          <Tag
            color={r.status === 'ok' ? 'success' : r.status === 'error' ? 'error' : 'processing'}
            style={{ margin: 0, fontSize: 11 }}
          >
            {r.method}
          </Tag>
          <Text
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {r.url}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
            {r.status === 'pending' ? '进行中' : `${r.durationMs ?? 0} ms`}
          </Text>
        </div>
      ))}
    </div>
  );
}

/** 性能页签：组件与代码块总数 + 问题摘要。 */
export function PerfTab() {
  const schema = usePageBuilderStore((s) => s.schema);

  const stats = useMemo(() => {
    if (!schema) return { nodes: 0, codeBlocks: 0, errors: 0, warns: 0 };
    let nodes = 0;
    let codeBlocks = 0;
    const walk = (node: ComponentNode): void => {
      nodes += 1;
      if (node.type === 'button' || node.type === 'form') codeBlocks += 1;
      for (const child of node.children ?? []) walk(child);
    };
    walk(schema.root);
    const issues = collectSchemaIssues(schema);
    return {
      nodes,
      codeBlocks,
      errors: issues.filter((i) => i.severity === 'error').length,
      warns: issues.length - issues.filter((i) => i.severity === 'error').length,
    };
  }, [schema]);

  return (
    <div style={{ padding: '12px 16px' }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        组件与代码块总数({stats.nodes + stats.codeBlocks})
      </Text>
      <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
        <StatCard label="组件节点" value={stats.nodes} />
        <StatCard label="代码/动作块" value={stats.codeBlocks} />
        <StatCard label="检查错误" value={stats.errors} danger={stats.errors > 0} />
        <StatCard label="检查警告" value={stats.warns} danger={stats.warns > 0} />
      </div>
    </div>
  );
}

function StatCard({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        maxWidth: 160,
        padding: '8px 12px',
        background: '#f7f8fa',
        borderRadius: 6,
      }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <div>
        <Text
          style={{ fontSize: 20, fontWeight: 600, color: danger ? '#f54a45' : 'rgba(0,0,0,0.88)' }}
        >
          {value}
        </Text>
      </div>
    </div>
  );
}

/** 更多页签：调试工具入口。 */
export function MoreTab() {
  const schema = usePageBuilderStore((s) => s.schema);
  const setVmPanelOpen = usePageBuilderStore((s) => s.setVmPanelOpen);

  const copySchema = () => {
    if (!schema) return;
    void navigator.clipboard
      .writeText(JSON.stringify(schema, null, 2))
      .then(() => messageSuccess('Schema JSON 已复制到剪贴板'))
      .catch(() => messageSuccess('复制失败'));
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button size="small" style={{ width: 'fit-content' }} onClick={() => setVmPanelOpen(true)}>
        打开视图模型面板
      </Button>
      <Button size="small" style={{ width: 'fit-content' }} onClick={copySchema}>
        复制页面 Schema JSON
      </Button>
    </div>
  );
}

/** 轻量提示（避免循环依赖 antd message 重复实例）。 */
function messageSuccess(text: string): void {
  // antd message 为全局单例，此处动态引入以保持本文件无副作用导入
  import('antd').then(({ message }) => message.success(text));
}
