/**
 * 流程轨迹视图 — 只读展示流程实例的执行状态。
 *
 * 不依赖 flowgram 画布，使用纯 SVG 渲染简化流程图：
 * - 节点按执行顺序纵向排列
 * - 节点状态着色：绿色(完成) / 蓝色(执行中) / 橙色(等待) / 灰色(未到达)
 * - 连线着色：已走路径高亮 / 未走路径半透明
 * - 条件分支展示分叉/汇聚
 */

import { useMemo } from 'react';
import { Tag, Typography, Empty, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ProcessTraceData } from '../../api/processes.js';
import { TRACE_STATUS_META, TOKENS as T } from '@apaas/shared/design';

const { Text } = Typography;

interface ProcessTraceViewerProps {
  trace: ProcessTraceData | null;
  loading?: boolean;
}

// 色彩/文案语义收敛到 @apaas/shared/design（评审 P1：此前与 runtime
// TraceViewer 双端复制）；图标本地渲染
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

/** 节点类型 → 中文名。 */
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

export default function ProcessTraceViewer({ trace, loading }: ProcessTraceViewerProps) {
  /** 按拓扑顺序排列节点。 */
  const orderedNodes = useMemo(() => {
    if (!trace) return [];
    const nodes = trace.schema.nodes;
    const edges = trace.schema.edges;

    // 构建邻接表
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const n of nodes) {
      outgoing.set(n.id, []);
      incoming.set(n.id, []);
    }
    for (const e of edges) {
      outgoing.get(e.sourceNodeID)?.push(e.targetNodeID);
      incoming.get(e.targetNodeID)?.push(e.sourceNodeID);
    }

    // 拓扑排序（BFS）
    const visited = new Set<string>();
    const queue: string[] = [];
    // 找入度为 0 的节点（start）
    for (const n of nodes) {
      if ((incoming.get(n.id) ?? []).length === 0) {
        queue.push(n.id);
      }
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of outgoing.get(id) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }

    // 按 visited 顺序返回节点，未访问的追加到末尾
    const ordered = [...visited].map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
    for (const n of nodes) {
      if (!visited.has(n.id)) ordered.push(n);
    }
    return ordered;
  }, [trace]);

  if (loading) {
    return <Spin style={{ display: 'block', padding: 40, textAlign: 'center' }} />;
  }

  if (!trace) {
    return <Empty description="无流程轨迹数据" style={{ padding: 40 }} />;
  }

  const statusMap = new Map(trace.schema.nodes.map((n) => [n.id, n.traceStatus]));
  const activeNodeIds = new Set(trace.instance.activeNodeIds);

  /** 判断连线是否为已走路径（两端节点都已完成或正在执行）。 */
  const isEdgeActive = (sourceId: string, targetId: string): boolean => {
    const s = statusMap.get(sourceId);
    const t = statusMap.get(targetId);
    return (
      (s === 'COMPLETED' || s === 'RUNNING' || s === 'WAITING') &&
      (t === 'COMPLETED' || t === 'RUNNING' || t === 'WAITING')
    );
  };

  return (
    <div style={{ padding: '16px 0' }}>
      {/* 实例状态概览 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Tag
          color={
            trace.instance.status === 'COMPLETED'
              ? 'green'
              : trace.instance.status === 'RUNNING'
                ? 'blue'
                : trace.instance.status === 'WAITING_USER_TASK'
                  ? 'orange'
                  : 'red'
          }
        >
          {trace.instance.status === 'COMPLETED'
            ? '已完成'
            : trace.instance.status === 'RUNNING'
              ? '执行中'
              : trace.instance.status === 'WAITING_USER_TASK'
                ? '等待审批'
                : trace.instance.status === 'FAILED'
                  ? '失败'
                  : trace.instance.status === 'TERMINATED'
                    ? '已终止'
                    : trace.instance.status}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          启动时间: {new Date(trace.instance.startedAt).toLocaleString('zh-CN')}
        </Text>
        {trace.instance.finishedAt && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            完成时间: {new Date(trace.instance.finishedAt).toLocaleString('zh-CN')}
          </Text>
        )}
      </div>

      {/* 节点轨迹列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {orderedNodes.map((node, idx) => {
          if (!node) return null;
          const status = node.traceStatus;
          const cfg = statusConfig(status);
          const isActive = activeNodeIds.has(node.id);
          const isLast = idx === orderedNodes.length - 1;
          const title = (node.data?.title as string) || NODE_TYPE_LABEL[node.type] || node.type;

          // 查找下游连线
          const outgoingEdges = trace.schema.edges.filter((e) => e.sourceNodeID === node.id);

          return (
            <div key={node.id}>
              {/* 节点卡片 */}
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
                  transition: 'all 0.3s ease',
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

              {/* 连线 */}
              {!isLast && outgoingEdges.length > 0 && (
                <div
                  style={{
                    marginLeft: 20,
                    padding: '4px 0',
                    borderLeft: `2px ${isEdgeActive(node.id, outgoingEdges[0]!.targetNodeID) ? `solid ${T.colorSuccess}` : `dashed ${T.colorBorder}`}`,
                    height: 20,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 任务列表 */}
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
                        : task.status === 'PENDING'
                          ? 'orange'
                          : 'default'
                  }
                >
                  {task.status === 'APPROVED'
                    ? '通过'
                    : task.status === 'REJECTED'
                      ? '驳回'
                      : task.status === 'PENDING'
                        ? '待处理'
                        : task.status}
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
