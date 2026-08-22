/**
 * 运行时组件渲染器 — 纯预览模式。
 *
 * 共享渲染逻辑（全部 26 个渲染器 + 辅助函数）在 @apaas/shared/stores 的
 * component-renderer.tsx 中。此文件仅保留 Runtime-UI 专有部分：
 * - DatasetChart：数据集图表（从 datasetsApi 加载数据）
 * - ctx 构建：从 useRuntimeCtx 组装 RenderContext（mode: 'preview'）
 * - chart 渲染器覆盖：数据集模式走 DatasetChart，否则委托共享 RENDERERS.chart
 *
 * 修复：root 始终使用页面根节点（原代码递归时 root={child} 导致 onAction
 * 只搜索当前子树，无法找到其他节点的事件动作）。
 */

import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ComponentNode } from '../api/pages.js';
import { datasetsApi } from '../api/datasets.js';
import { buildChartOption } from '@apaas/shared/page';
import type { ChartType, ChartAggregation } from '@apaas/shared';
import {
  createComponentRenderer,
  extractActions,
  findNodeById,
  getPropAsString,
  RENDERERS,
  type RenderContext,
  type RendererFn,
} from '@apaas/shared/stores';
import { useRuntimeCtx, type RuntimeState } from './RuntimeStore.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 数据集图表（Runtime-UI 专有）
// ---------------------------------------------------------------------------

/** 数据集图表 — 从数据集 API 加载数据并渲染 ECharts。 */
function DatasetChart({
  datasetId,
  chartType,
  title,
  categoryField,
  valueField,
  aggregation,
}: {
  datasetId: string;
  chartType: ChartType;
  title: string;
  categoryField?: string;
  valueField?: string;
  aggregation: ChartAggregation;
}) {
  const { data: result, isLoading } = useQuery({
    queryKey: ['dataset-rows', datasetId],
    queryFn: () => datasetsApi.queryRows(datasetId, { page: 1, pageSize: 100 }),
  });

  if (isLoading) {
    return (
      <div
        style={{
          padding: 24,
          background: '#fff',
          borderRadius: 6,
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text type="secondary">加载中...</Text>
      </div>
    );
  }

  const rows = result?.items ?? [];
  const option = buildChartOption(chartType, title, categoryField, valueField, aggregation, rows);

  return (
    <div style={{ padding: 8, background: '#fff', borderRadius: 6, minHeight: 200 }}>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// chart 渲染器覆盖（数据集模式 → DatasetChart；否则 → 共享 RENDERERS.chart）
// ---------------------------------------------------------------------------

/** 图表渲染 — 数据集模式走 DatasetChart，否则委托共享渲染器。 */
const renderChartWithDataset: RendererFn = (node, ctx, renderChild) => {
  const datasourceType = getPropAsString(node, 'datasourceType', ctx);
  const datasourceId = getPropAsString(node, 'datasourceId', ctx);

  if (datasourceType === 'dataset' && datasourceId) {
    const title = getPropAsString(node, 'title', ctx) || '图表';
    const chartType = (getPropAsString(node, 'chartType', ctx) || 'bar') as ChartType;
    const categoryField = getPropAsString(node, 'categoryField', ctx) || undefined;
    const valueField = getPropAsString(node, 'valueField', ctx) || undefined;
    const aggregation = (getPropAsString(node, 'aggregation', ctx) || 'sum') as ChartAggregation;

    return (
      <DatasetChart
        datasetId={datasourceId}
        chartType={chartType}
        title={title}
        categoryField={categoryField}
        valueField={valueField}
        aggregation={aggregation}
      />
    );
  }

  // 默认：委托共享 chart 渲染器（preview 模式解析绑定数据）
  return RENDERERS.chart(node, ctx, renderChild);
};

// ---------------------------------------------------------------------------
// 共享渲染器（注入 chart 覆盖）
// ---------------------------------------------------------------------------

const SharedRenderer = createComponentRenderer({
  renderers: { chart: renderChartWithDataset },
});

// ---------------------------------------------------------------------------
// 顶层渲染入口
// ---------------------------------------------------------------------------

interface ComponentRendererProps {
  node: ComponentNode;
  root: ComponentNode;
  isRoot?: boolean;
}

/**
 * 组件节点递归渲染器（运行时）。
 *
 * ctx 在此构建一次（mode: 'preview' + root 用于 onAction 节点查找），
 * 然后传递给共享渲染器，递归子节点复用同一 ctx —— root 始终为页面根节点。
 */
export default function ComponentRenderer({ node, root, isRoot: _isRoot }: ComponentRendererProps) {
  const vm = useRuntimeCtx((s) => s.vm);
  const setVariable = useRuntimeCtx((s) => s.setVariable);
  const executeActions = useRuntimeCtx((s) => s.executeActions);
  const queryData = useRuntimeCtx((s) => s.queryData);
  const executeAction = useRuntimeCtx((s) => s.executeAction);

  const runtime: RuntimeState = {
    vm,
    setVariable,
    executeActions,
    queryData,
    executeAction,
  };

  const ctx: RenderContext = {
    mode: 'preview',
    viewModel: { variables: {} },
    selectedNodeId: null,
    onSelect: () => {},
    onAction: (nodeId: string, eventName: string) => {
      const target = findNodeById(root, nodeId);
      if (!target) {
        console.warn(`[onAction] Node ${nodeId} not found in root`);
        return;
      }
      const propValue = target.props[eventName];
      const actions = extractActions(propValue);
      if (actions.length > 0) {
        void executeActions(actions);
      } else {
        console.warn(
          `[onAction] No actions found for event ${eventName} on node ${nodeId}`,
          propValue,
        );
      }
    },
    runtime,
    vm,
  };

  return <SharedRenderer node={node} ctx={ctx} />;
}
