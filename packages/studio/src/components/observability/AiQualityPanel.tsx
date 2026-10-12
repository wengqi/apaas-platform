/**
 * AI 生成质量面板（ADR-0004 决策 5 / R5 主线）— 观测中心内的质量分析区。
 *
 * 指标口径与 gateway AiAnalyticsService 对齐：G3 首拦率（事件流）、
 * 一次人审通过率（batchId 批次）、返工轮次（资源链未批准版本摊薄）。
 * 数据驱动修方言指南的入口：拦截规则码分布即指南缺口靶子。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, Row, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { observabilityApi, type AiGenerationAnalytics } from '../../api/observability.js';

const { Text } = Typography;

/** 百分比展示（0.0342 → 3.4%）。 */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** 指标卡通用提示语。 */
const HINTS = {
  blockRate: 'AI 提交被 G3 校验合同拒绝的比例（事件流口径）',
  firstPass: '批次口径：无驳回行的 AI 批次 / 有终局的 AI 批次',
  rework: '每批准资源摊到的未批准版本数（REJECTED+SUPERSEDED / APPROVED）',
} as const;

const kindColumns = [
  { title: '资源类型', dataIndex: 'kind', key: 'kind', width: 140 },
  { title: '通过', dataIndex: 'accepted', key: 'accepted', width: 100 },
  { title: '被拦', dataIndex: 'rejected', key: 'rejected', width: 100 },
  {
    title: '拦截率',
    dataIndex: 'blockRate',
    key: 'blockRate',
    width: 120,
    render: (v: number) => pct(v),
  },
];

const issueCodeColumns = [
  {
    title: '拦截规则码',
    dataIndex: 'code',
    key: 'code',
    render: (v: string) => <Text code>{v}</Text>,
  },
  { title: '次数', dataIndex: 'count', key: 'count', width: 120 },
];

const moduleColumns = [
  { title: '模块', dataIndex: 'module', key: 'module', width: 140 },
  { title: '批准版本', dataIndex: 'approved', key: 'approved', width: 120 },
  { title: '返工版本', dataIndex: 'rework', key: 'rework', width: 120 },
];

function StatCard(props: {
  title: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <Card size="small">
      <Statistic
        title={
          props.hint ? (
            <Tooltip title={props.hint}>
              <span>{props.title}</span>
            </Tooltip>
          ) : (
            props.title
          )
        }
        value={props.value}
        suffix={props.suffix}
        valueStyle={props.danger ? { color: T.colorErrorDeep } : undefined}
      />
    </Card>
  );
}

export default function AiQualityPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['ai-quality-analytics'] as const,
    queryFn: () => observabilityApi.aiAnalytics(),
  });

  if (!data && isLoading) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Text type="secondary">AI 生成质量加载中…</Text>
      </Card>
    );
  }

  if (!data) return null;

  const hasAnyData =
    data.attempts.total > 0 || data.batches.verdictTotal > 0 || data.rework.approvedVersions > 0;

  return (
    <Card
      style={{ marginBottom: 16 }}
      title="AI 生成质量（ADR-0004 遥测）"
      extra={<Text type="secondary">AI 提交 → G3 校验 → 人审 的全链路质量</Text>}
    >
      {!hasAnyData ? (
        <Empty description="暂无 AI 生成记录——经 MCP 提交草稿后此处出现质量指标" />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <StatCard title="提交尝试" value={data.attempts.total} />
            </Col>
            <Col span={6}>
              <StatCard
                title="G3 拦截率"
                value={pct(data.attempts.blockRate)}
                hint={HINTS.blockRate}
                danger={data.attempts.blockRate > 0.3}
              />
            </Col>
            <Col span={6}>
              <StatCard
                title="一次人审通过率"
                value={pct(data.batches.firstPassRate)}
                hint={HINTS.firstPass}
                danger={data.batches.verdictTotal > 0 && data.batches.firstPassRate < 0.5}
              />
            </Col>
            <Col span={6}>
              <StatCard
                title="平均返工轮次"
                value={data.rework.avgReworkPerApproved}
                hint={HINTS.rework}
                danger={data.rework.avgReworkPerApproved > 1}
              />
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Text strong>按资源类型</Text>
              <Table<AiGenerationAnalytics['byKind'][number]>
                size="small"
                style={{ marginTop: 8 }}
                columns={kindColumns}
                dataSource={data.byKind}
                rowKey="kind"
                pagination={false}
              />
            </Col>
            <Col span={12}>
              <Text strong>G3 拦截规则码 Top 10（修方言指南的靶子）</Text>
              <Table<AiGenerationAnalytics['topIssueCodes'][number]>
                size="small"
                style={{ marginTop: 8 }}
                columns={issueCodeColumns}
                dataSource={data.topIssueCodes}
                rowKey="code"
                pagination={false}
                locale={{ emptyText: '尚无拦截记录' }}
              />
            </Col>
          </Row>

          {data.byModule.length > 0 ? (
            <>
              <Text strong style={{ display: 'block', marginTop: 16 }}>
                版本链（批准 vs 返工）
              </Text>
              <Table<AiGenerationAnalytics['byModule'][number]>
                size="small"
                style={{ marginTop: 8 }}
                columns={moduleColumns}
                dataSource={data.byModule}
                rowKey="module"
                pagination={false}
              />
            </>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              批次：批准 {data.batches.approved} / 驳回 {data.batches.rejected}（终局{' '}
              {data.batches.verdictTotal} 批）· 版本：批准 {data.rework.approvedVersions} / 返工{' '}
              <Tag color={data.rework.reworkVersions > 0 ? 'orange' : 'default'}>
                {data.rework.reworkVersions}
              </Tag>
            </Text>
          </div>
        </>
      )}
    </Card>
  );
}
