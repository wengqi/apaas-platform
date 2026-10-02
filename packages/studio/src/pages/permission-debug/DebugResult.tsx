/**
 * 权限调试结果区（从 PermissionDebug.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 *
 * 结论 Alert + 原因 Tag + 命中规则表 + 合并条件/翻译后 where 折叠面板
 * + 翻译失败告警（fail-closed）+ 记录可见性验证结果。
 */

import { Alert, Card, Space, Table, Tag, Typography, Collapse } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MatchedRule, PermissionDebugResult } from '../../api/permission-debug.js';
import { EFFECT_COLORS, REASON_META } from './constants.js';

const { Text } = Typography;

/** JSON 折叠面板（null 显示"无限制"）。 */
function JsonPanel({ label, value }: { label: string; value: unknown }) {
  return (
    <Collapse
      size="small"
      items={[
        {
          key: label,
          label,
          children:
            value === null || value === undefined ? (
              <Text type="secondary">无限制</Text>
            ) : (
              <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>
                {JSON.stringify(value, null, 2)}
              </pre>
            ),
        },
      ]}
    />
  );
}

/** 条件/字段域 pre 渲染（表格单元格）。 */
function PreCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <Text type="secondary">—</Text>;
  return (
    <pre style={{ margin: 0, fontSize: 12, maxWidth: 260, maxHeight: 120, overflow: 'auto' }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const matchedRuleColumns: ColumnsType<MatchedRule> = [
  {
    title: '效果',
    dataIndex: 'effect',
    key: 'effect',
    width: 90,
    render: (v: MatchedRule['effect']) => <Tag color={EFFECT_COLORS[v] ?? 'default'}>{v}</Tag>,
  },
  {
    title: '角色 ID',
    dataIndex: 'roleId',
    key: 'roleId',
    width: 220,
    render: (v: string) => (
      <Text code style={{ fontSize: 12 }}>
        {v}
      </Text>
    ),
  },
  {
    title: '目标 ID',
    dataIndex: 'targetId',
    key: 'targetId',
    width: 200,
    ellipsis: true,
    render: (v: string) => (
      <Text code style={{ fontSize: 12 }}>
        {v}
      </Text>
    ),
  },
  {
    title: '条件',
    dataIndex: 'condition',
    key: 'condition',
    render: (v: unknown) => <PreCell value={v} />,
  },
  {
    title: '字段域',
    dataIndex: 'fieldScope',
    key: 'fieldScope',
    width: 200,
    render: (v: unknown) => <PreCell value={v} />,
  },
];

/** 记录可见性验证结果（recordCheck 为 null 时不渲染）。 */
function RecordCheckAlert({ found, visible }: { found: boolean; visible: boolean }) {
  if (!found) {
    return <Alert type="warning" showIcon message="记录不存在" />;
  }
  return visible ? (
    <Alert type="success" showIcon message="记录可见" />
  ) : (
    <Alert type="error" showIcon message="记录不可见" />
  );
}

/** 权限调试结果展示。 */
export default function DebugResult({ result }: { result: PermissionDebugResult }) {
  const reason = REASON_META[result.reason] ?? { label: result.reason, color: 'default' };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type={result.allowed ? 'success' : 'error'}
        showIcon
        message={
          <Space size={8}>
            <Text strong>{result.allowed ? '允许' : '拒绝'}</Text>
            <Tag color={reason.color}>{reason.label}</Tag>
          </Space>
        }
        description={`有效角色 ${result.roleIds.length} 个，命中规则 ${result.matchedRules.length} 条`}
      />

      {result.translateError ? (
        <Alert
          type="error"
          showIcon
          message="行级条件翻译失败（fail-closed）"
          description={result.translateError}
        />
      ) : null}

      {result.recordCheck ? (
        <RecordCheckAlert found={result.recordCheck.found} visible={result.recordCheck.visible} />
      ) : null}

      <Card size="small" title="命中规则">
        <Table<MatchedRule>
          size="small"
          rowKey="ruleId"
          columns={matchedRuleColumns}
          dataSource={result.matchedRules}
          pagination={false}
          locale={{ emptyText: '无命中规则' }}
        />
      </Card>

      <JsonPanel label="合并条件（mergedCondition）" value={result.mergedCondition} />
      <JsonPanel label="翻译后 Prisma where（translatedWhere）" value={result.translatedWhere} />
    </Space>
  );
}
