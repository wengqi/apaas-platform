/**
 * 观测中心（P1 运维治理）— 平台级观测事件查询。
 *
 * 顶部 4 张分类统计卡（最近 24h 总数/错误数）+ 分类/级别筛选 + 事件分页表格。
 * 分类/级别常量以 @apaas/shared/observability 为 SSOT。
 * 顶栏导航由 TenantLayout 常显，页面只负责内容区。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Row, Col, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_LEVELS,
  EVENT_LEVEL_LABELS,
  type EventCategory,
  type EventLevel,
} from '@apaas/shared';
import { observabilityApi, type ObservabilityEvent } from '../api/observability.js';
import AiQualityPanel from '../components/observability/AiQualityPanel.js';
import PageHeader from '../components/shared/PageHeader.js';
import PageContainer from '../components/shared/PageContainer.js';

const { Text } = Typography;

const DEFAULT_PAGE_SIZE = 20;
/** 统计卡栅格跨度：24 栅格 / 8 = 每行 3 张卡（5 分类 3+2 排布）。 */
const SUMMARY_SPAN = 8;

/** 级别 → Tag 颜色（INFO=blue/WARN=orange/ERROR=red）。 */
const LEVEL_COLORS: Record<EventLevel, string> = {
  INFO: 'blue',
  WARN: 'orange',
  ERROR: 'red',
};

/** 分类 → Tag 颜色（仅观测中心事件表格使用）。 */
const CATEGORY_COLORS: Record<EventCategory, string> = {
  FUNCTION_EXEC: 'geekblue',
  SLOW_QUERY: 'gold',
  PAGE_ERROR: 'volcano',
  OPEN_API_CALL: 'cyan',
  AI_GENERATION: 'purple',
};

/** 「全部」筛选项的空串哨兵值（接入查询参数时归一为 undefined）。 */
const ALL = '';

const categoryFilterOptions = [
  { value: ALL, label: '全部' },
  ...EVENT_CATEGORIES.map((c) => ({ value: c, label: EVENT_CATEGORY_LABELS[c] })),
];

const levelFilterOptions = [
  { value: ALL, label: '全部' },
  ...EVENT_LEVELS.map((l) => ({ value: l, label: EVENT_LEVEL_LABELS[l] })),
];

/** traceId 截断展示长度（完整值经 copyable 复制）。 */
const TRACE_ID_DISPLAY_LEN = 12;

function renderTraceId(traceId: string | null) {
  if (!traceId) return '—';
  const shown =
    traceId.length > TRACE_ID_DISPLAY_LEN ? `${traceId.slice(0, TRACE_ID_DISPLAY_LEN)}…` : traceId;
  return (
    <Text code copyable={{ text: traceId }} style={{ fontSize: 12 }}>
      {shown}
    </Text>
  );
}

const columns = [
  {
    title: '分类',
    dataIndex: 'category',
    key: 'category',
    width: 120,
    render: (v: EventCategory) => (
      <Tag color={CATEGORY_COLORS[v] ?? 'default'}>{EVENT_CATEGORY_LABELS[v] ?? v}</Tag>
    ),
  },
  {
    title: '级别',
    dataIndex: 'level',
    key: 'level',
    width: 90,
    render: (v: EventLevel) => (
      <Tag color={LEVEL_COLORS[v] ?? 'default'}>{EVENT_LEVEL_LABELS[v] ?? v}</Tag>
    ),
  },
  {
    title: '来源',
    dataIndex: 'source',
    key: 'source',
    width: 200,
    ellipsis: true,
  },
  {
    title: '消息',
    dataIndex: 'message',
    key: 'message',
    ellipsis: true,
  },
  {
    title: '耗时',
    dataIndex: 'durationMs',
    key: 'durationMs',
    width: 100,
    render: (v: number | null) => (v === null ? '—' : `${v}ms`),
  },
  {
    title: 'Trace ID',
    dataIndex: 'traceId',
    key: 'traceId',
    width: 180,
    render: (v: string | null) => renderTraceId(v),
  },
  {
    title: '时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
    render: (v: string) => new Date(v).toLocaleString('zh-CN'),
  },
];

export default function ObservabilityCenter() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [levelFilter, setLevelFilter] = useState<string>(ALL);

  const { data: summary } = useQuery({
    queryKey: ['observability-summary'],
    queryFn: () => observabilityApi.summary(),
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['observability-events', page, pageSize, categoryFilter, levelFilter] as const,
    queryFn: () =>
      observabilityApi.events({
        page,
        pageSize,
        category: (categoryFilter || undefined) as EventCategory | undefined,
        level: (levelFilter || undefined) as EventLevel | undefined,
      }),
  });

  return (
    <PageContainer>
      <PageHeader
        title="观测中心"
        description="云函数执行 / 慢查询 / 页面报错 / 开放 API 调用 / AI 生成（最近 24h）"
      />

      <div>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {(summary ?? []).map((s) => (
            <Col key={s.category} span={SUMMARY_SPAN}>
              <Card size="small">
                <Statistic
                  title={EVENT_CATEGORY_LABELS[s.category] ?? s.category}
                  value={s.total}
                />
                <Text type="danger" style={{ fontSize: 12 }}>
                  错误 {s.errors}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>

        <AiQualityPanel />

        <Card style={{ marginBottom: 16 }}>
          <Space wrap size={12}>
            <Select
              style={{ width: 180 }}
              value={categoryFilter}
              onChange={(v) => {
                setCategoryFilter(v);
                setPage(1);
              }}
              options={categoryFilterOptions}
            />
            <Select
              style={{ width: 140 }}
              value={levelFilter}
              onChange={(v) => {
                setLevelFilter(v);
                setPage(1);
              }}
              options={levelFilterOptions}
            />
            <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>
              刷新
            </Button>
          </Space>
        </Card>

        <Card>
          <Table<ObservabilityEvent>
            loading={isLoading}
            columns={columns}
            dataSource={data?.items ?? []}
            rowKey="id"
            pagination={{
              current: data?.page ?? 1,
              pageSize: data?.pageSize ?? DEFAULT_PAGE_SIZE,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            expandable={{
              expandedRowRender: (record) => (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text style={{ fontSize: 12 }}>{record.message}</Text>
                  {record.detail ? (
                    <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>
                      {JSON.stringify(record.detail, null, 2)}
                    </pre>
                  ) : null}
                </Space>
              ),
              rowExpandable: (record) => Boolean(record.detail) || record.message.length > 80,
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
