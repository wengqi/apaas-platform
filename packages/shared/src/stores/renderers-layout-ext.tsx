/**
 * 布局/导航/弹层扩展渲染器 — 页面模块对齐批次C3：
 * pagination / steps / collapse_panel / carousel / button_group /
 * flat_filter / modal_dialog / drawer / popover_card。
 *
 * 容器类（collapse_panel / carousel / modal_dialog / drawer / popover_card）
 * 编辑模式渲染内联放置区供拖拽搭建，预览模式按容器语义渲染。
 */

import { useState, type ReactNode } from 'react';
import {
  Button,
  Carousel,
  Collapse,
  Drawer,
  Modal,
  Pagination,
  Popover,
  Radio,
  Space,
  Steps,
  Typography,
} from 'antd';
import type { ComponentNode } from './types.js';
import type { RenderContext, RenderChild } from './renderer-helpers.js';
import {
  extractSelectOptions,
  getPropAsBool,
  getPropAsNumber,
  getPropAsString,
  getFieldBinding,
  renderContainerChildren,
} from './renderer-helpers.js';

const { Text } = Typography;

export function renderPagination(node: ComponentNode, ctx: RenderContext): ReactNode {
  return (
    <div style={{ padding: 8, textAlign: 'right' }}>
      <Pagination
        size="small"
        defaultCurrent={getPropAsNumber(node, 'current', ctx) || 1}
        pageSize={getPropAsNumber(node, 'pageSize', ctx) || 10}
        total={getPropAsNumber(node, 'total', ctx) || 50}
        showSizeChanger={false}
        onChange={() => ctx.onAction(node.id, 'onChange')}
      />
    </div>
  );
}

export function renderSteps(node: ComponentNode, ctx: RenderContext): ReactNode {
  const current = getPropAsNumber(node, 'current', ctx) || 0;
  const items = extractSelectOptions(node).map((o) => ({ title: o.label }));
  return (
    <div style={{ padding: 8 }}>
      <Steps size="small" current={current} items={items} />
    </div>
  );
}

export function renderCollapsePanel(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  // 编辑模式：内联放置区（拖拽搭建面板内容）
  if (ctx.mode === 'edit') {
    return (
      <div style={{ padding: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          折叠面板（每个子组件为一个面板）
        </Text>
        {renderContainerChildren(node, ctx, renderChild)}
      </div>
    );
  }
  const labels = extractSelectOptions(node);
  const children = node.children ?? [];
  // 标题口径：options > 子组件 label/header > 容器 header
  const headerFallback = typeof node.props.header === 'string' ? node.props.header : '';
  const labelAt = (i: number): string => {
    if (labels[i]) return labels[i]!.label;
    const child = children[i];
    const cp = child?.props as Record<string, unknown> | undefined;
    if (typeof cp?.label === 'string' && cp.label) return cp.label;
    if (typeof cp?.header === 'string' && cp.header) return cp.header;
    return headerFallback || `面板${i + 1}`;
  };
  const items =
    labels.length > 0 || children.length > 0
      ? children.map((c, i) => ({
          key: labels[i]?.value || c.id,
          label: labelAt(i),
          children: renderChild(c),
        }))
      : [{ key: 'panel', label: '面板', children: children.map((c) => renderChild(c)) }];
  return (
    <div style={{ padding: 4 }}>
      <Collapse
        size="small"
        items={items}
        defaultActiveKey={items.slice(0, 1).map((i) => String(i.key))}
      />
    </div>
  );
}

export function renderCarousel(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const children = node.children ?? [];
  // 编辑模式：内联放置区；预览模式：antd Carousel 轮播
  if (ctx.mode === 'edit') {
    return (
      <div style={{ padding: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          轮播图（每个子组件为一帧）
        </Text>
        {renderContainerChildren(node, ctx, renderChild)}
      </div>
    );
  }
  if (children.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          background: '#fafbfc',
          border: '1px dashed #eef0f4',
          borderRadius: 6,
          textAlign: 'center',
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          轮播图（空）
        </Text>
      </div>
    );
  }
  return (
    <Carousel style={{ padding: 4 }} dots>
      {children.map((c) => (
        <div key={c.id}>{renderChild(c)}</div>
      ))}
    </Carousel>
  );
}

export function renderButtonGroup(node: ComponentNode, ctx: RenderContext): ReactNode {
  const options = extractSelectOptions(node);
  // buttons prop：[{ label }] 或 string[]（数据绑定面板常量输入口径）
  const rawButtons = node.props.buttons;
  let fromButtons: { label: string; value: string }[] = [];
  if (Array.isArray(rawButtons)) {
    fromButtons = rawButtons
      .map((b) => {
        if (typeof b === 'string') return { label: b, value: b };
        if (b && typeof b === 'object' && typeof (b as { label?: unknown }).label === 'string') {
          const label = (b as { label: string }).label;
          const value =
            typeof (b as { value?: unknown }).value === 'string'
              ? (b as { value: string }).value
              : label;
          return { label, value };
        }
        return null;
      })
      .filter((x): x is { label: string; value: string } => x !== null);
  }
  const list =
    fromButtons.length > 0
      ? fromButtons
      : options.length > 0
        ? options
        : [{ label: '按钮', value: 'btn' }];
  return (
    <div style={{ padding: 4 }}>
      <Space size={8} wrap>
        {list.map((o) => (
          <Button key={o.value} size="small" onClick={() => ctx.onAction(node.id, 'onClick')}>
            {o.label}
          </Button>
        ))}
      </Space>
    </div>
  );
}

export function renderFlatFilter(node: ComponentNode, ctx: RenderContext): ReactNode {
  const options = extractSelectOptions(node);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <div style={{ padding: 4 }}>
      <Radio.Group
        size="small"
        options={options.map((o) => ({ label: o.label, value: o.value }))}
        value={isPreview ? (value as string) : undefined}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

export function renderModalDialog(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '弹窗';
  // 编辑模式：内联放置区（可直接向弹窗内拖组件）
  if (ctx.mode === 'edit') {
    return (
      <div style={{ padding: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          弹窗（{title}）
        </Text>
        {renderContainerChildren(node, ctx, renderChild)}
      </div>
    );
  }
  // open prop 未配置（undefined）时提供内置「打开弹窗」触发按钮（本地 state）；
  // 显式配置（常量/绑定）时受控
  if (node.props.open === undefined) {
    return <ModalWithTrigger node={node} ctx={ctx} title={title} renderChild={renderChild} />;
  }
  const open = getPropAsBool(node, 'open', ctx);
  return (
    <Modal
      title={title}
      open={open}
      onCancel={() => ctx.onAction(node.id, 'onCancel')}
      footer={null}
      width={getPropAsNumber(node, 'width', ctx) || 520}
    >
      {renderContainerChildren(node, ctx, renderChild)}
    </Modal>
  );
}

/** 弹窗预览：内置触发按钮 + 本地 open state（open prop 未配置时）。 */
function ModalWithTrigger({
  node,
  ctx,
  title,
  renderChild,
}: {
  node: ComponentNode;
  ctx: RenderContext;
  title: string;
  renderChild: RenderChild;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 4, display: 'inline-block' }}>
      <Button size="small" onClick={() => setOpen(true)}>
        打开{title}
      </Button>
      <Modal
        title={title}
        open={open}
        onCancel={() => {
          setOpen(false);
          ctx.onAction(node.id, 'onCancel');
        }}
        footer={null}
        width={getPropAsNumber(node, 'width', ctx) || 520}
      >
        {renderContainerChildren(node, ctx, renderChild)}
      </Modal>
    </div>
  );
}

export function renderDrawer(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '侧拉窗';
  if (ctx.mode === 'edit') {
    return (
      <div style={{ padding: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          侧拉窗（{title}）
        </Text>
        {renderContainerChildren(node, ctx, renderChild)}
      </div>
    );
  }
  if (node.props.open === undefined) {
    return <DrawerWithTrigger node={node} ctx={ctx} title={title} renderChild={renderChild} />;
  }
  const open = getPropAsBool(node, 'open', ctx);
  return (
    <Drawer
      title={title}
      open={open}
      onClose={() => ctx.onAction(node.id, 'onCancel')}
      width={getPropAsNumber(node, 'width', ctx) || 480}
    >
      {renderContainerChildren(node, ctx, renderChild)}
    </Drawer>
  );
}

/** 侧拉窗预览：内置触发按钮 + 本地 open state（open prop 未配置时）。 */
function DrawerWithTrigger({
  node,
  ctx,
  title,
  renderChild,
}: {
  node: ComponentNode;
  ctx: RenderContext;
  title: string;
  renderChild: RenderChild;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 4, display: 'inline-block' }}>
      <Button size="small" onClick={() => setOpen(true)}>
        打开{title}
      </Button>
      <Drawer
        title={title}
        open={open}
        onClose={() => {
          setOpen(false);
          ctx.onAction(node.id, 'onCancel');
        }}
        width={getPropAsNumber(node, 'width', ctx) || 480}
      >
        {renderContainerChildren(node, ctx, renderChild)}
      </Drawer>
    </div>
  );
}

export function renderPopoverCard(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '气泡卡片';
  // 编辑模式：内联放置区；预览模式：点击触发按钮弹出气泡内容
  if (ctx.mode === 'edit') {
    return (
      <div style={{ padding: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          气泡卡片（{title}）
        </Text>
        {renderContainerChildren(node, ctx, renderChild)}
      </div>
    );
  }
  return (
    <div style={{ display: 'inline-block', padding: 4 }}>
      <Popover
        trigger="click"
        title={title}
        content={renderContainerChildren(node, ctx, renderChild)}
      >
        <Button size="small">{title}</Button>
      </Popover>
    </div>
  );
}
