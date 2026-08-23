/**
 * 数据流可视化画布 — 基于 ReactFlow 的节点连线式编辑器。
 *
 * 将 DataFlowConfig 渲染为可视化管线：
 * 数据源(多个) → 关联(可选) → 筛选(可选) → 聚合(可选) → 输出
 *
 * 用户可拖拽节点调整布局，点击节点打开右侧配置面板。
 * 配置变更实时同步到 DataFlowConfig。
 */

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
} from 'reactflow';
import { Button, Space, Typography, Modal, message } from 'antd';
import { SaveOutlined, PlayCircleOutlined, EyeOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { dataFlowsApi } from '../../api/datasets.js';
import type { DataFlowConfig, DataFlow } from '../../api/datasets.js';
import { objectsApi } from '../../api/objects.js';
import { FLOW_NODE_TYPES, type FlowNodeData } from './flow-nodes.js';
import NodeConfigPanel, { type SelectedNode } from './NodeConfigPanel.js';
import './dataflow-canvas.css';

const { Text } = Typography;

const NODE_X_GAP = 300;
const NODE_Y_GAP = 120;

interface DataFlowCanvasProps {
  flow: DataFlow;
  onClose: () => void;
}

/** 从 DataFlowConfig 生成 ReactFlow 节点和连线。 */
function buildNodesAndEdges(config: DataFlowConfig): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 数据源节点（纵向排列在左侧）
  const sourceCount = config.sources.length;
  config.sources.forEach((src, i) => {
    const yOffset = (i - (sourceCount - 1) / 2) * NODE_Y_GAP;
    nodes.push({
      id: `source-${i}`,
      type: 'dataSource',
      position: { x: 0, y: yOffset },
      data: {
        label: src.alias || `数据源 ${i + 1}`,
        summary: src.objectId ? `对象: ${src.objectId}` : '未选择对象',
        config,
        nodeId: `source-${i}`,
      } as FlowNodeData,
    });
  });

  let prevNodeIds = config.sources.map((_, i) => `source-${i}`);
  let x = NODE_X_GAP;

  // 关联节点
  if (config.join) {
    const joinNode: Node = {
      id: 'join',
      type: 'join',
      position: { x, y: 0 },
      data: {
        label: '关联',
        summary: `${config.join.leftAlias} → ${config.join.rightAlias} (${config.join.type})`,
        config,
        nodeId: 'join',
      } as FlowNodeData,
    };
    nodes.push(joinNode);
    prevNodeIds.forEach((id) => edges.push({ id: `${id}-join`, source: id, target: 'join' }));
    prevNodeIds = ['join'];
    x += NODE_X_GAP;
  }

  // 筛选节点
  if (config.filter) {
    nodes.push({
      id: 'filter',
      type: 'filter',
      position: { x, y: 0 },
      data: {
        label: '筛选',
        summary: '已配置筛选条件',
        config,
        nodeId: 'filter',
      } as FlowNodeData,
    });
    prevNodeIds.forEach((id) => edges.push({ id: `${id}-filter`, source: id, target: 'filter' }));
    prevNodeIds = ['filter'];
    x += NODE_X_GAP;
  }

  // 聚合节点
  if (config.aggregation) {
    const metricCount = config.aggregation.metrics?.length ?? 0;
    nodes.push({
      id: 'aggregation',
      type: 'aggregation',
      position: { x, y: 0 },
      data: {
        label: '分组汇总',
        summary: `${config.aggregation.groupBy?.length ?? 0} 分组字段, ${metricCount} 指标`,
        config,
        nodeId: 'aggregation',
      } as FlowNodeData,
    });
    prevNodeIds.forEach((id) =>
      edges.push({ id: `${id}-aggregation`, source: id, target: 'aggregation' }),
    );
    prevNodeIds = ['aggregation'];
    x += NODE_X_GAP;
  }

  // 输出节点
  nodes.push({
    id: 'output',
    type: 'output',
    position: { x, y: 0 },
    data: {
      label: '输出',
      summary: `${config.outputFields?.length ?? 0} 个输出字段`,
      config,
      nodeId: 'output',
    } as FlowNodeData,
  });
  prevNodeIds.forEach((id) => edges.push({ id: `${id}-output`, source: id, target: 'output' }));

  return { nodes, edges };
}

/** 将选中的节点 ID 映射回 SelectedNode。 */
function nodeIdToSelected(nodeId: string | null): SelectedNode {
  if (!nodeId) return null;
  if (nodeId.startsWith('source-')) {
    const index = parseInt(nodeId.slice(7), 10);
    return { type: 'dataSource', index };
  }
  if (nodeId === 'join') return { type: 'join' };
  if (nodeId === 'filter') return { type: 'filter' };
  if (nodeId === 'aggregation') return { type: 'aggregation' };
  if (nodeId === 'output') return { type: 'output' };
  return null;
}

export default function DataFlowCanvas({ flow, onClose }: DataFlowCanvasProps) {
  const { appId = '' } = useParams();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<DataFlowConfig>(flow.config);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  // 加载对象列表
  const { data: objects = [] } = useQuery({
    queryKey: ['objects', appId],
    queryFn: () => objectsApi.list(appId),
  });

  // 保存
  const saveMutation = useMutation({
    mutationFn: (newConfig: DataFlowConfig) => dataFlowsApi.update(flow.id, { config: newConfig }),
    onSuccess: () => {
      message.success('数据流配置已保存');
      void queryClient.invalidateQueries({ queryKey: ['data-flows', appId] });
    },
    onError: () => message.error('保存失败'),
  });

  // 预览
  const previewMutation = useMutation({
    mutationFn: () => {
      // 先保存再预览
      return dataFlowsApi.update(flow.id, { config }).then(() => dataFlowsApi.preview(flow.id));
    },
    onSuccess: (result) => {
      const rows = result.rows?.length ?? 0;
      const cols = result.columns?.length ?? 0;
      Modal.info({
        title: '预览结果',
        content: (
          <div>
            <p>列数: {cols}</p>
            <p>行数: {rows}</p>
            {result.columns?.slice(0, 5).map((c) => (
              <p key={c.apiName}>
                · {c.label} ({c.type})
              </p>
            ))}
          </div>
        ),
      });
    },
    onError: () => message.error('预览失败，请检查配置'),
  });

  // 执行
  const executeMutation = useMutation({
    mutationFn: () => {
      return dataFlowsApi.update(flow.id, { config }).then(() => dataFlowsApi.execute(flow.id));
    },
    onSuccess: () => {
      message.success('数据流已执行，数据集正在刷新');
      void queryClient.invalidateQueries({ queryKey: ['data-flows', appId] });
      void queryClient.invalidateQueries({ queryKey: ['datasets', appId] });
    },
    onError: () => message.error('执行失败'),
  });

  const { nodes, edges } = useMemo(() => buildNodesAndEdges(config), [config]);

  const nodeTypes = useMemo<NodeTypes>(() => ({ ...FLOW_NODE_TYPES }), []);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNode(nodeIdToSelected(node.id));
  }, []);

  const handleConfigChange = useCallback((newConfig: DataFlowConfig) => {
    setConfig(newConfig);
  }, []);

  const handleSave = () => saveMutation.mutate(config);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#f5f7fa' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          height: 48,
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <Space>
          <Button icon={<CloseOutlined />} type="text" onClick={onClose} />
          <Text strong style={{ fontSize: 15 }}>
            {flow.name} — 可视化编辑
          </Text>
        </Space>
        <Space>
          <Button
            icon={<EyeOutlined />}
            loading={previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            预览
          </Button>
          <Button
            icon={<PlayCircleOutlined />}
            type="primary"
            loading={executeMutation.isPending}
            onClick={() => executeMutation.mutate()}
          >
            执行
          </Button>
          <Button
            icon={<SaveOutlined />}
            type="primary"
            loading={saveMutation.isPending}
            onClick={handleSave}
          >
            保存
          </Button>
        </Space>
      </div>

      {/* 画布区域 */}
      <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 48px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                dataSource: '#52c41a',
                join: '#722ed1',
                filter: '#fa8c16',
                aggregation: '#1677ff',
                output: '#13c2c2',
              };
              return colors[node.type ?? ''] ?? '#d9d9d9';
            }}
          />
        </ReactFlow>

        {/* 配置面板 */}
        {selectedNode && (
          <NodeConfigPanel
            selected={selectedNode}
            config={config}
            objects={objects}
            onChange={handleConfigChange}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
