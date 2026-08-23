/**
 * 容器类渲染器 — page / section / tabs / grid / grid_column / dashboard_grid。
 *
 * 从 component-renderer.tsx 拆分，实现逻辑不变。
 * 类型与辅助函数从 renderer-helpers.tsx 导入，避免循环依赖。
 */

import type { ReactNode } from 'react';
import { Card, Col, Row, Tabs } from 'antd';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import type { ComponentNode } from './types.js';
import type { LayoutItem } from '../page/index.js';
import type { RenderContext, RenderChild } from './renderer-helpers.js';
import {
  getPropAsString,
  getPropAsNumber,
  renderContainerChildren,
  PageLoadEffect,
} from './renderer-helpers.js';

const ResponsiveGrid = WidthProvider(GridLayout);

// ---------------------------------------------------------------------------
// 容器类渲染器
// ---------------------------------------------------------------------------

export function renderPage(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  return (
    <div style={{ minHeight: 60, padding: 8 }}>
      <PageLoadEffect node={node} ctx={ctx} />
      {renderContainerChildren(node, ctx, renderChild)}
    </div>
  );
}

export function renderSection(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const title = getPropAsString(node, 'title', ctx);
  return (
    <Card
      size="small"
      title={title || undefined}
      styles={{ body: { padding: 12 } }}
      style={{ marginBottom: 0 }}
    >
      {renderContainerChildren(node, ctx, renderChild)}
    </Card>
  );
}

export function renderTabs(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const children = node.children ?? [];
  const items = children.map((child, i) => ({
    key: child.id,
    label: getPropAsString(child, 'title', ctx) || child.name || `标签 ${i + 1}`,
    children: renderChild(child),
  }));
  const tabs = <Tabs items={items} size="small" />;
  if (ctx.mode === 'edit' && children.length === 0 && ctx.renderDropzone) {
    return ctx.renderDropzone(node.id, true, tabs);
  }
  return tabs;
}

export function renderGrid(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const gutter = getPropAsNumber(node, 'gutter', ctx) || 8;
  const children = node.children ?? [];
  const cols = children.map((child) => {
    const span = getPropAsNumber(child, 'span', ctx) || 12;
    return (
      <Col key={child.id} span={span}>
        {renderChild(child)}
      </Col>
    );
  });
  const row = <Row gutter={gutter}>{cols}</Row>;
  if (ctx.mode === 'edit' && ctx.renderDropzone) {
    return ctx.renderDropzone(node.id, children.length === 0, row);
  }
  return row;
}

export function renderGridColumn(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  return renderContainerChildren(node, ctx, renderChild);
}

export function renderDashboardGrid(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const children = node.children ?? [];
  const cols = getPropAsNumber(node, 'cols', ctx) || 12;
  const rowHeight = getPropAsNumber(node, 'rowHeight', ctx) || 30;
  const rawLayout = node.props.layout;
  const layout: LayoutItem[] = Array.isArray(rawLayout)
    ? (rawLayout as unknown as LayoutItem[])
    : children.map((child, i) => ({
        i: child.id,
        x: (i % 2) * (cols / 2),
        y: Math.floor(i / 2) * 4,
        w: cols / 2,
        h: 8,
      }));

  const isEditing = ctx.mode === 'edit';

  const gridItems = children.map((child) => (
    <div key={child.id} style={{ height: '100%' }}>
      {renderChild(child)}
    </div>
  ));

  return (
    <ResponsiveGrid
      className="dashboard-grid-layout"
      layout={layout}
      cols={cols}
      rowHeight={rowHeight}
      margin={[8, 8]}
      isDraggable={isEditing}
      isResizable={isEditing}
      onLayoutChange={(newLayout: Layout[]) => {
        if (ctx.onLayoutChange) {
          ctx.onLayoutChange(
            node.id,
            newLayout.map((l: Layout) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
          );
        }
      }}
    >
      {gridItems}
    </ResponsiveGrid>
  );
}
