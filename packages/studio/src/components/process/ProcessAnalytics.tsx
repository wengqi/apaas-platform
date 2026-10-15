/**
 * 流程监控「效率分析」Tab（P1 运维治理）。
 *
 * 顶部 Statistic 汇总卡（总实例/在途/已完成/失败/超时/平均耗时/完成率）
 * + 按流程定义拆分的效率表格。数据来自 GET /processes/analytics。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Table, Tooltip, Typography } from 'antd';
import { processesApi, type ProcessDefAnalytics } from '../../api/processes.js';
import { formatCompletionRate, formatDuration } from './process-analytics/format.js';

const { Text } = Typography;

/** 耗时/完成率列宽。 */
const METRIC_COL_WIDTH = 110;

const byProcessColumns = [
  {
    title: '流程名',
    dataIndex: 'name',
    key: 'name',
    ellipsis: true,
    render: (v: string, record: ProcessDefAnalytics) => (
      <Tooltip title={record.apiName}>
        <Text style={{ fontSize: 13 }}>{v}</Text>
      </Tooltip>
    ),
  },
  { title: '总数', dataIndex: 'total', key: 'total', width: 80 },
  { title: '完成', dataIndex: 'completed', key: 'completed', width: 80 },
  {
    title: '失败',
    dataIndex: 'failed',
    key: 'failed',
    width: 80,
    render: (v: number) => (v > 0 ? <Text type="danger">{v}</Text> : v),
  },
  { title: '超时', dataIndex: 'timedOut', key: 'timedOut', width: 80 },
  {
    title: '平均耗时',
    dataIndex: 'avgDurationMs',
    key: 'avgDurationMs',
    width: METRIC_COL_WIDTH,
    render: (v: number | null) => formatDuration(v),
  },
  {
    title: '完成率',
    dataIndex: 'completionRate',
    key: 'completionRate',
    width: METRIC_COL_WIDTH,
    render: (v: number | null) => formatCompletionRate(v),
  },
];

/** 效率分析 Tab 内容（appId 由流程监控页注入）。 */
export default function ProcessAnalytics({ appId }: { appId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['process-analytics', appId],
    queryFn: () => processesApi.analytics(appId),
    enabled: !!appId,
  });

  const totals = data?.totals;
  const inFlight = (totals?.running ?? 0) + (totals?.waitingUserTask ?? 0);

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}>
          <Statistic title="总实例" value={totals?.total ?? 0} />
        </Col>
        <Col span={3}>
          <Statistic title="在途" value={inFlight} />
        </Col>
        <Col span={3}>
          <Statistic title="已完成" value={totals?.completed ?? 0} />
        </Col>
        <Col span={3}>
          <Statistic
            title="失败"
            value={totals?.failed ?? 0}
            valueStyle={(totals?.failed ?? 0) > 0 ? { color: T.colorErrorDeep } : undefined}
          />
        </Col>
        <Col span={3}>
          <Statistic title="超时" value={totals?.timedOut ?? 0} />
        </Col>
        <Col span={4}>
          <Statistic title="平均耗时" value={formatDuration(totals?.avgDurationMs ?? null)} />
        </Col>
        <Col span={4}>
          <Statistic title="完成率" value={formatCompletionRate(totals?.completionRate ?? null)} />
        </Col>
      </Row>

      <Card size="small" title="按流程拆分">
        <Table<ProcessDefAnalytics>
          size="small"
          rowKey="processDefId"
          loading={isLoading}
          columns={byProcessColumns}
          dataSource={data?.byProcess ?? []}
          pagination={false}
        />
      </Card>
    </div>
  );
}
