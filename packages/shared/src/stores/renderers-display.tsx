/**
 * 展示类渲染器 — button / statistic / chart / rich_text_display / divider / text。
 *
 * 从 component-renderer.tsx 拆分，实现逻辑不变。
 * 类型与辅助函数从 renderer-helpers.tsx 导入，避免循环依赖。
 */

import type { ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { Button, Divider, Statistic, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { ComponentNode } from './types.js';
import { resolvePropValue } from './expression-engine.js';
import { buildChartOption } from '../page/chart-options.js';
import type { ChartType, ChartAggregation } from '../page/index.js';
import type { RenderContext } from './renderer-helpers.js';
import {
  getPropAsString,
  getPropAsNumber,
  getPropAsBool,
  asPropObject,
} from './renderer-helpers.js';

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// 展示类渲染器
// ---------------------------------------------------------------------------

export function renderButton(node: ComponentNode, ctx: RenderContext): ReactNode {
  const text = getPropAsString(node, 'text', ctx) || getPropAsString(node, 'label', ctx) || '按钮';
  const type = getPropAsString(node, 'type', ctx) || 'default';
  const danger = getPropAsBool(node, 'danger', ctx);
  return (
    <Button
      type={type as 'primary' | 'default' | 'dashed' | 'link' | 'text'}
      danger={danger || undefined}
      size="small"
      onClick={() => ctx.onAction(node.id, 'onClick')}
    >
      {text}
    </Button>
  );
}

export function renderStatistic(node: ComponentNode, ctx: RenderContext): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '统计';
  const prefix = getPropAsString(node, 'prefix', ctx) || undefined;
  const suffix = getPropAsString(node, 'suffix', ctx) || undefined;

  // 有聚合配置时（指标卡），编辑模式显示占位提示
  const hasAggregation = !!getPropAsString(node, 'aggregation', ctx);
  if (hasAggregation && ctx.mode === 'edit') {
    return (
      <div
        style={{
          padding: 16,
          background: '#fafbfc',
          border: '1px dashed #d9d9d9',
          borderRadius: 6,
          minHeight: 80,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          {title}
        </Text>
        <Text strong style={{ fontSize: 24 }}>
          指标卡
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          预览时加载数据
        </Text>
      </div>
    );
  }

  const value = getPropAsNumber(node, 'value', ctx);
  return <Statistic title={title} value={value} prefix={prefix} suffix={suffix} />;
}

export function renderChart(node: ComponentNode, ctx: RenderContext): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '图表';
  const chartType = (getPropAsString(node, 'chartType', ctx) || 'bar') as ChartType;
  const categoryField = getPropAsString(node, 'categoryField', ctx) || undefined;
  const valueField = getPropAsString(node, 'valueField', ctx) || undefined;
  const aggregation = (getPropAsString(node, 'aggregation', ctx) || 'sum') as ChartAggregation;

  // 编辑模式使用 mock 数据；预览模式解析绑定数据
  const data =
    ctx.mode === 'preview' ? resolvePropValue(node.props.data ?? null, { vm: ctx.vm }) : null;

  const option = buildChartOption(chartType, title, categoryField, valueField, aggregation, data);

  const styleObj = asPropObject(node.props.style);
  const customHeight = styleObj && typeof styleObj.height === 'number' ? styleObj.height : 200;
  const chartHeight = customHeight > 0 ? customHeight : 200;

  return (
    <div
      style={{
        padding: 8,
        background: '#fff',
        borderRadius: 6,
        height: '100%',
        minHeight: chartHeight,
      }}
    >
      <ReactECharts option={option} style={{ height: chartHeight }} />
    </div>
  );
}

export function renderRichTextDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  const content = getPropAsString(node, 'content', ctx);
  if (content) {
    // XSS 防护：Schema 内容（富文本 HTML）来自用户编写/外部导入，
    // 渲染前必须消毒，移除 script/事件处理器/javascript: URL 等注入向量
    const clean = DOMPurify.sanitize(content);
    return <div style={{ padding: 8 }} dangerouslySetInnerHTML={{ __html: clean }} />;
  }
  return (
    <div
      style={{
        padding: 16,
        background: '#fafbfc',
        border: '1px dashed #eef0f4',
        borderRadius: 6,
        minHeight: 60,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        富文本内容
      </Text>
    </div>
  );
}

export function renderDivider(node: ComponentNode, ctx: RenderContext): ReactNode {
  const label = getPropAsString(node, 'label', ctx) || getPropAsString(node, 'text', ctx);
  const orientation = getPropAsString(node, 'orientation', ctx) || 'left';
  return (
    <Divider orientation={orientation as 'left' | 'center' | 'right'} style={{ margin: '8px 0' }}>
      {label || undefined}
    </Divider>
  );
}

export function renderText(node: ComponentNode, ctx: RenderContext): ReactNode {
  const content = getPropAsString(node, 'content', ctx) || '文本内容';
  const level = getPropAsNumber(node, 'level', ctx);
  if (level >= 1 && level <= 5) {
    return <Title level={level as 1 | 2 | 3 | 4 | 5}>{content}</Title>;
  }
  return <Text>{content}</Text>;
}
