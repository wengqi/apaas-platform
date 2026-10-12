/**
 * 数据流画布自定义节点 — 5 种节点类型的视觉渲染。
 *
 * 每种节点显示图标 + 标题 + 配置摘要，点击触发配置面板。
 */

import { TOKENS as T, PRESET as P } from '@apaas/shared/design';
import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import {
  DatabaseOutlined,
  MergeCellsOutlined,
  FilterOutlined,
  BarChartOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { DataFlowConfig } from '../../api/datasets.js';

/** 节点数据传递的上下文。 */
export interface FlowNodeData {
  label: string;
  summary: string;
  config: DataFlowConfig;
  nodeId: string;
}

/** 节点基础样式包装。 */
function NodeShell({
  icon,
  label,
  summary,
  color,
  selected,
  showTarget = true,
  showSource = true,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  color: string;
  selected: boolean;
  showTarget?: boolean;
  showSource?: boolean;
}) {
  return (
    <div
      className="flow-node"
      style={{
        borderColor: selected ? T.colorPrimary : color,
        boxShadow: selected ? '0 0 0 2px rgba(22,119,255,0.15)' : 'none',
      }}
    >
      {showTarget && (
        <Handle type="target" position={Position.Left} style={{ background: color }} />
      )}
      <div className="flow-node-header" style={{ background: color }}>
        <span className="flow-node-icon">{icon}</span>
        <span className="flow-node-title">{label}</span>
      </div>
      <div className="flow-node-body">{summary}</div>
      {showSource && (
        <Handle type="source" position={Position.Right} style={{ background: color }} />
      )}
    </div>
  );
}

/** 数据源节点。 */
function DataSourceNodeComponent({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell
      icon={<DatabaseOutlined />}
      label={data.label}
      summary={data.summary}
      color={T.colorSuccess}
      selected={!!selected}
      showTarget={false}
    />
  );
}
export const DataSourceNode = memo(DataSourceNodeComponent);

/** 关联节点。 */
function JoinNodeComponent({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell
      icon={<MergeCellsOutlined />}
      label="关联"
      summary={data.summary}
      color={P.purple6}
      selected={!!selected}
    />
  );
}
export const JoinNode = memo(JoinNodeComponent);

/** 筛选节点。 */
function FilterNodeComponent({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell
      icon={<FilterOutlined />}
      label="筛选"
      summary={data.summary}
      color={T.colorWarning}
      selected={!!selected}
    />
  );
}
export const FilterNode = memo(FilterNodeComponent);

/** 聚合节点。 */
function AggregationNodeComponent({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell
      icon={<BarChartOutlined />}
      label="分组汇总"
      summary={data.summary}
      color={T.colorPrimary}
      selected={!!selected}
    />
  );
}
export const AggregationNode = memo(AggregationNodeComponent);

/** 输出节点。 */
function OutputNodeComponent({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell
      icon={<ExportOutlined />}
      label="输出"
      summary={data.summary}
      color={P.cyan6}
      selected={!!selected}
      showSource={false}
    />
  );
}
export const OutputNode = memo(OutputNodeComponent);

/** 节点类型 → 组件 映射。 */
export const FLOW_NODE_TYPES = {
  dataSource: DataSourceNode,
  join: JoinNode,
  filter: FilterNode,
  aggregation: AggregationNode,
  output: OutputNode,
} as const;
