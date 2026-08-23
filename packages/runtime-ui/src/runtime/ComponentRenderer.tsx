/**
 * 运行时组件渲染器 — 纯预览模式。
 *
 * 共享渲染逻辑（全部 26 个渲染器 + 辅助函数）在 @apaas/shared/stores 的
 * component-renderer.tsx 中。此文件仅保留 Runtime-UI 专有部分：
 * - AggregationChart：后端聚合图表（对象/数据集 → chart-data API → ECharts）
 * - MetricCard：指标卡（后端标量聚合 → AntD Statistic）
 * - ctx 构建：从 useRuntimeCtx 组装 RenderContext（mode: 'preview'）
 * - chart/statistic 渲染器覆盖：有数据源配置时走后端聚合，否则委托共享渲染器
 *
 * 修复：root 始终使用页面根节点（原代码递归时 root={child} 导致 onAction
 * 只搜索当前子树，无法找到其他节点的事件动作）。
 */

import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Statistic, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ComponentNode } from '../api/pages.js';
import { datasetsApi, type ChartDataRequest } from '../api/datasets.js';
import { buildChartOptionFromAggregated } from '@apaas/shared/page';
import type { ChartType, ChartAggregation, TimeGranularity } from '@apaas/shared';
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
// 后端聚合图表（Runtime-UI 专有 — 替代原 DatasetChart 的客户端聚合）
// ---------------------------------------------------------------------------

/** 从组件节点 props 构建聚合请求参数。 */
function buildChartRequest(node: ComponentNode): ChartDataRequest | null {
  const datasourceType = getPropAsString(node, 'datasourceType', nullContext);
  const datasourceId = getPropAsString(node, 'datasourceId', nullContext);
  if (!datasourceType || !datasourceId) return null;

  return {
    sourceType: datasourceType as 'object' | 'dataset',
    sourceId: datasourceId,
    categoryField: getPropAsString(node, 'categoryField', nullContext) || undefined,
    valueField: getPropAsString(node, 'valueField', nullContext) || undefined,
    aggregation: (getPropAsString(node, 'aggregation', nullContext) || 'sum') as ChartAggregation,
    timeGranularity:
      (getPropAsString(node, 'timeGranularity', nullContext) as TimeGranularity | '') || undefined,
  };
}

/** 空上下文（仅用于从 props 读取字符串，不涉及 vm/事件）。 */
const nullContext: RenderContext = {
  mode: 'preview',
  viewModel: { variables: {} },
  selectedNodeId: null,
  onSelect: () => {},
  onAction: () => {},
  runtime: {} as RuntimeState,
  vm: {},
};

/** 后端聚合图表 — 调用 chart-data API 获取聚合结果，直接构建 ECharts option。 */
function AggregationChart({
  appId,
  request,
  chartType,
  title,
}: {
  appId: string;
  request: ChartDataRequest;
  chartType: ChartType;
  title: string;
}) {
  const {
    data: result,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['chart-data', appId, request],
    queryFn: () => datasetsApi.getChartData(appId, request),
  });

  if (isLoading) {
    return (
      <ChartContainer>
        <Text type="secondary">加载中...</Text>
      </ChartContainer>
    );
  }

  if (isError || !result) {
    return (
      <ChartContainer>
        <Text type="danger">数据加载失败</Text>
      </ChartContainer>
    );
  }

  const option = buildChartOptionFromAggregated(chartType, title, result.data);

  return (
    <ChartContainer>
      <ReactECharts option={option} style={{ height: '100%', minHeight: 200 }} />
    </ChartContainer>
  );
}

/** 图表容器（统一样式）。 */
function ChartContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 8,
        background: '#fff',
        borderRadius: 6,
        height: '100%',
        minHeight: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 指标卡（Runtime-UI 专有 — 后端标量聚合 + AntD Statistic）
// ---------------------------------------------------------------------------

/** 指标卡 — 调用 chart-data API（无 categoryField → 标量聚合），渲染 AntD Statistic。 */
function MetricCard({
  appId,
  request,
  title,
  prefix,
  suffix,
}: {
  appId: string;
  request: ChartDataRequest;
  title: string;
  prefix?: string;
  suffix?: string;
}) {
  const { data: result, isLoading } = useQuery({
    queryKey: ['metric-card', appId, request],
    queryFn: () => datasetsApi.getChartData(appId, request),
  });

  const value = result?.data?.[0]?.value;

  return (
    <div style={{ padding: 16, background: '#fff', borderRadius: 6, height: '100%' }}>
      <Statistic
        title={title}
        value={isLoading ? '...' : (value ?? 0)}
        prefix={prefix}
        suffix={suffix}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// chart / statistic 渲染器覆盖
// ---------------------------------------------------------------------------

/** 图表渲染 — 有数据源配置时走后端聚合，否则委托共享渲染器。 */
const renderChartWithAggregation: RendererFn = (node, ctx, renderChild) => {
  const appId = (ctx.runtime as RuntimeState & { appId?: string }).appId;

  if (appId) {
    const request = buildChartRequest(node);
    if (request) {
      const title = getPropAsString(node, 'title', ctx) || '图表';
      const chartType = (getPropAsString(node, 'chartType', ctx) || 'bar') as ChartType;

      const styleObj = node.props.style as Record<string, unknown> | undefined;
      const customHeight = styleObj && typeof styleObj.height === 'number' ? styleObj.height : 200;
      const chartHeight = customHeight > 0 ? customHeight : 200;

      return (
        <div style={{ height: '100%', minHeight: chartHeight }}>
          <AggregationChart appId={appId} request={request} chartType={chartType} title={title} />
        </div>
      );
    }
  }

  return RENDERERS.chart(node, ctx, renderChild);
};

/** 统计数字渲染 — 有聚合配置时走后端标量聚合（指标卡），否则委托共享渲染器。 */
const renderStatisticWithAggregation: RendererFn = (node, ctx, renderChild) => {
  const appId = (ctx.runtime as RuntimeState & { appId?: string }).appId;

  if (appId) {
    const datasourceType = getPropAsString(node, 'datasourceType', ctx);
    const datasourceId = getPropAsString(node, 'datasourceId', ctx);
    const aggregation = getPropAsString(node, 'aggregation', ctx) as ChartAggregation | '';

    if (datasourceType && datasourceId && aggregation) {
      const title = getPropAsString(node, 'title', ctx) || '指标';
      const prefix = getPropAsString(node, 'prefix', ctx) || undefined;
      const suffix = getPropAsString(node, 'suffix', ctx) || undefined;

      const request: ChartDataRequest = {
        sourceType: datasourceType as 'object' | 'dataset',
        sourceId: datasourceId,
        valueField: getPropAsString(node, 'valueField', ctx) || undefined,
        aggregation,
      };

      return (
        <MetricCard appId={appId} request={request} title={title} prefix={prefix} suffix={suffix} />
      );
    }
  }

  return RENDERERS.statistic(node, ctx, renderChild);
};

// ---------------------------------------------------------------------------
// 共享渲染器（注入 chart + statistic 覆盖）
// ---------------------------------------------------------------------------

const SharedRenderer = createComponentRenderer({
  renderers: {
    chart: renderChartWithAggregation,
    statistic: renderStatisticWithAggregation,
  },
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
 *
 * appId 从路由参数获取，注入到 runtime 上下文供图表/指标卡调用后端聚合 API。
 */
export default function ComponentRenderer({ node, root, isRoot: _isRoot }: ComponentRendererProps) {
  const { appId } = useParams<{ appId: string }>();
  const vm = useRuntimeCtx((s) => s.vm);
  const setVariable = useRuntimeCtx((s) => s.setVariable);
  const executeActions = useRuntimeCtx((s) => s.executeActions);
  const queryData = useRuntimeCtx((s) => s.queryData);
  const executeAction = useRuntimeCtx((s) => s.executeAction);

  const runtime: RuntimeState & { appId?: string } = {
    vm,
    setVariable,
    executeActions,
    queryData,
    executeAction,
    appId,
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
