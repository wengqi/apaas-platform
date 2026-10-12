/**
 * 流程轨迹视图 — Runtime UI 版本。
 *
 * 纯 React 组件，不依赖 flowgram 画布。
 * 展示节点执行状态和审批记录。
 */

import { Tag, Typography, Empty, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ProcessTraceData } from '../api/tasks';
import { TRACE_STATUS_META, TOKENS as T } from '@apaas/shared/design';

const { Text } = Typography;

// 色彩/文案语义收敛到 @apaas/shared/design（评审 P1：此前与 studio
// ProcessTraceViewer 双端复制）；图标两端各自本地渲染
const STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircleOutlined style={{ color: TRACE_STATUS_META.COMPLETED?.color }} />,
  RUNNING: <LoadingOutlined spin style={{ color: TRACE_STATUS_META.RUNNING?.color }} />,
  WAITING: <ClockCircleOutlined style={{ color: TRACE_STATUS_META.WAITING?.color }} />,
  SKIPPED: <MinusCircleOutlined style={{ color: TRACE_STATUS_META.SKIPPED?.color }} />,
  PENDING: <MinusCircleOutlined style={{ color: T.colorTextQuaternary }} />,
};

function statusConfig(status: string): {
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  label: string;
  opacity: number;
} {
  const meta = TRACE_STATUS_META[status] ?? TRACE_STATUS_META.PENDING!;
  return { ...meta, icon: STATUS_ICONS[status] ?? STATUS_ICONS.PENDING! };
}

const NODE_TYPE_LABEL: Record<string, string> = {
  start: '开始',
  end: '结束',
  trigger: '触发器',
  userTask: '人工任务',
  notification: '通知',
  condition: '条件分支',
  objectOperation: '对象操作',
  httpRequest: 'HTTP请求',
  assign: '赋值',
  delay: '延时',
};

export default function TraceViewer({
  trace,
  loading,
}: {
  trace: ProcessTraceData | null;
  loading?: boolean;
}) {
  if (loading) return <Spin style={{ display: 'block', padding: 40, textAlign: 'center' }} />;
  if (!trace) return <Empty description="无流程轨迹数据" style={{ padding: 40 }} />;

  const statusMap = new Map(trace.schema.nodes.map((n) => [n.id, n.traceStatus]));
  const activeNodeIds = new Set(trace.instance.activeNodeIds);

  const isEdgeActive = (s: string, t: string) => {
    const ss = statusMap.get(s),
      ts = statusMap.get(t);
    return (
      ['COMPLETED', 'RUNNING', 'WAITING'].includes(ss ?? '') &&
      ['COMPLETED', 'RUNNING', 'WAITING'].includes(ts ?? '')
    );
  };

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Tag
          color={
            trace.instance.status === 'COMPLETED'
              ? 'green'
              : trace.instance.status === 'WAITING_USER_TASK'
                ? 'orange'
                : 'blue'
          }
        >
          {trace.instance.status === 'COMPLETED'
            ? '已完成'
            : trace.instance.status === 'WAITING_USER_TASK'
              ? '等待审批'
              : trace.instance.status === 'RUNNING'
                ? '执行中'
                : trace.instance.status}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          启动: {new Date(trace.instance.startedAt).toLocaleString('zh-CN')}
        </Text>
      </div>

      {trace.schema.nodes.map((node, idx) => {
        const cfg = statusConfig(node.traceStatus);
        const isActive = activeNodeIds.has(node.id);
        const title = (node.data?.title as string) || NODE_TYPE_LABEL[node.type] || node.type;
        const outgoing = trace.schema.edges.filter((e) => e.sourceNodeID === node.id);
        const isLast = idx === trace.schema.nodes.length - 1;

        return (
          <div key={node.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                border: `2px solid ${cfg.border}`,
                background: cfg.bg,
                opacity: cfg.opacity,
                ...(isActive ? { boxShadow: `0 0 8px ${cfg.border}40` } : {}),
              }}
            >
              {cfg.icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 14 }}>
                  {title}
                </Text>
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                  {NODE_TYPE_LABEL[node.type] || node.type}
                  {node.traceFinishedAt &&
                    ` · ${new Date(node.traceFinishedAt).toLocaleTimeString('zh-CN')}`}
                </div>
              </div>
              <Tag style={{ margin: 0, fontSize: 11, borderColor: cfg.border, color: cfg.color }}>
                {cfg.label}
              </Tag>
            </div>
            {!isLast && outgoing.length > 0 && (
              <div
                style={{
                  marginLeft: 20,
                  padding: '4px 0',
                  borderLeft: `2px ${isEdgeActive(node.id, outgoing[0]!.targetNodeID) ? `solid ${T.colorSuccess}` : `dashed ${T.colorBorder}`}`,
                  height: 20,
                }}
              />
            )}
          </div>
        );
      })}

      {trace.tasks.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            审批记录
          </Typography.Title>
          {trace.tasks.map((task) => (
            <div
              key={task.id}
              style={{
                padding: '8px 12px',
                marginBottom: 8,
                borderRadius: 6,
                background: task.status === 'PENDING' ? T.colorWarningBg : T.colorFillQuaternary,
                border: `1px solid ${T.colorBorderSecondary}`,
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text strong style={{ fontSize: 13 }}>
                  {task.taskName}
                </Text>
                <Tag
                  color={
                    task.status === 'APPROVED'
                      ? 'green'
                      : task.status === 'REJECTED'
                        ? 'red'
                        : 'orange'
                  }
                >
                  {task.status === 'APPROVED'
                    ? '通过'
                    : task.status === 'REJECTED'
                      ? '驳回'
                      : '待处理'}
                </Tag>
              </div>
              {task.comment && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                  意见: {task.comment}
                </Text>
              )}
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                {new Date(task.createdAt).toLocaleString('zh-CN')}
                {task.completedAt && ` → ${new Date(task.completedAt).toLocaleString('zh-CN')}`}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
