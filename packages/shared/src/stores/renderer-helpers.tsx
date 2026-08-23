/**
 * 渲染器辅助层 — 类型定义 + 属性读取辅助 + 共享组件。
 *
 * 从 component-renderer.tsx 提取，供主文件和 4 个渲染器子文件共享，
 * 避免主文件 ↔ 子文件之间的循环依赖。
 *
 * 内容：
 * - 类型：TableRow / RenderContext / RenderChild / RendererFn
 * - 节点查找 / 事件动作提取 / 隐藏判定
 * - 属性读取辅助（getProp / getPropAsString / ...）
 * - 字段绑定辅助（getFieldBindPath / getFieldBinding）
 * - 属性对象提取（asPropObject / extractTableColumns / extractDetailFields / extractSelectOptions）
 * - 共享组件（renderContainerChildren / FormFieldItem / PageLoadEffect）
 */

import { useEffect, type ReactNode } from 'react';
import { Form } from 'antd';
import type { DescriptionsProps, TableProps } from 'antd';
import type { ActionConfig, ComponentNode, PropValue, ViewModel } from './types.js';
import type { RuntimeState } from './runtime-store.js';
import { resolvePropValue, getByPath } from './expression-engine.js';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 表格行记录类型。 */
export type TableRow = Record<string, unknown>;

/** 组件渲染上下文，传递模式 / 视图模型 / 选择 / 事件回调。 */
export interface RenderContext {
  mode: 'edit' | 'preview';
  viewModel: ViewModel;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onAction: (nodeId: string, eventName: string) => void;
  /** 运行时上下文（预览模式数据/事件；编辑模式为 no-op）。 */
  runtime: RuntimeState;
  /** 运行时 vm 值（预览模式；编辑模式为空对象）。 */
  vm: Record<string, unknown>;
  /**
   * 编辑模式：容器子节点放置区渲染回调。
   * 由 Studio 注入 DroppableArea（@dnd-kit/core）；Runtime-UI 不需要（始终 preview）。
   */
  renderDropzone?: (parentId: string, isEmpty: boolean, children: ReactNode) => ReactNode;
  /**
   * 编辑模式：仪表盘网格布局变化回调（拖拽/resize 后更新 layout 到 schema）。
   * Runtime-UI 不需要（始终 preview/static）。
   */
  onLayoutChange?: (nodeId: string, layout: import('../page/index.js').LayoutItem[]) => void;
}

/** 子节点渲染回调。 */
export type RenderChild = (child: ComponentNode) => ReactNode;

/** 组件渲染函数签名。 */
export type RendererFn = (
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
) => ReactNode;

// ---------------------------------------------------------------------------
// 节点查找 / 事件动作提取 / 隐藏判定
// ---------------------------------------------------------------------------

/** 在组件树中按 ID 查找节点（递归）。 */
export function findNodeById(root: ComponentNode, id: string): ComponentNode | undefined {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 从事件属性值提取动作链（ActionConfig[] / ActionConfig / { __action }）。 */
export function extractActions(prop: PropValue | undefined): ActionConfig[] {
  if (!prop) return [];
  if (Array.isArray(prop)) {
    return prop.flatMap((p) => extractActions(p));
  }
  if (prop && typeof prop === 'object' && '__action' in prop) {
    return [(prop as { __action: ActionConfig }).__action];
  }
  if (prop && typeof prop === 'object' && 'type' in prop) {
    return [prop as unknown as ActionConfig];
  }
  return [];
}

/** 预览模式判定节点是否隐藏（hidden 可为布尔或 { __bind }）。 */
export function shouldHide(node: ComponentNode, vm: Record<string, unknown>): boolean {
  const h = node.hidden;
  if (h === undefined || h === false) return false;
  if (h === true) return true;
  return !!resolvePropValue(h, { vm });
}

// ---------------------------------------------------------------------------
// 属性读取辅助
// ---------------------------------------------------------------------------

/** 读取属性原始值（编辑模式）或解析后值（预览模式解析绑定/表达式）。 */
export function getProp(node: ComponentNode, key: string, ctx?: RenderContext): unknown {
  const raw = node.props[key] ?? null;
  if (ctx && ctx.mode === 'preview') {
    return resolvePropValue(raw, { vm: ctx.vm });
  }
  return raw;
}

/** 安全获取字符串属性值（预览模式解析绑定/表达式）。 */
export function getPropAsString(node: ComponentNode, key: string, ctx?: RenderContext): string {
  const v = getProp(node, key, ctx);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** 安全获取数字属性值（预览模式解析绑定/表达式）。 */
export function getPropAsNumber(node: ComponentNode, key: string, ctx?: RenderContext): number {
  const v = getProp(node, key, ctx);
  return typeof v === 'number' ? v : 0;
}

/** 安全获取布尔属性值（预览模式解析绑定/表达式）。 */
export function getPropAsBool(node: ComponentNode, key: string, ctx?: RenderContext): boolean {
  const v = getProp(node, key, ctx);
  return typeof v === 'boolean' ? v : false;
}

/** 从 value 属性推断写回路径（优先 __bind，回退 vm.record.<apiName>）。 */
export function getFieldBindPath(node: ComponentNode): string | null {
  // 优先检查 __bind 表达式
  const raw = node.props.value;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && '__bind' in raw) {
    return (raw as { __bind: string }).__bind;
  }
  // 检查 bindPath 属性（Studio 搭建器输出的直接绑定路径）
  const bindPath = node.props.bindPath;
  if (typeof bindPath === 'string' && bindPath) {
    return bindPath;
  }
  const apiName = node.props.apiName;
  return typeof apiName === 'string' ? `vm.record.${apiName}` : null;
}

/** 表单字段双向绑定：读取 value + 构造 onChange 写回 vm。 */
export function getFieldBinding(
  node: ComponentNode,
  ctx: RenderContext,
): {
  isPreview: boolean;
  value: unknown;
  setValue: (v: unknown) => void;
} {
  const isPreview = ctx.mode === 'preview';
  const bindPath = isPreview ? getFieldBindPath(node) : null;
  const value = isPreview
    ? bindPath
      ? getByPath(ctx.vm, bindPath.startsWith('vm.') ? bindPath.slice(3) : bindPath)
      : getProp(node, 'value', ctx)
    : undefined;
  const setValue = (v: unknown) => {
    if (bindPath) ctx.runtime.setVariable(bindPath, v);
  };
  return { isPreview, value, setValue };
}

/** 将 PropValue 对象提取为 Record。 */
export function asPropObject(value: PropValue | undefined): Record<string, PropValue> | null {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !('__bind' in value) &&
    !('__expr' in value) &&
    !('__action' in value)
  ) {
    return value as Record<string, PropValue>;
  }
  return null;
}

/** 从 columns prop 提取 AntD 表格列配置。 */
export function extractTableColumns(node: ComponentNode): TableProps<TableRow>['columns'] {
  const raw = node.props.columns;
  if (!Array.isArray(raw)) return [];
  return raw.map((col, i) => {
    const obj = asPropObject(col);
    const label = obj && typeof obj.label === 'string' ? obj.label : `列${i + 1}`;
    const apiName =
      obj && typeof obj.apiName === 'string'
        ? obj.apiName
        : obj && typeof obj.fieldId === 'string'
          ? obj.fieldId
          : `col_${i}`;
    const width = obj && typeof obj.width === 'number' ? obj.width : undefined;
    return { title: label, dataIndex: apiName, width, key: apiName };
  });
}

/** 从 fields prop 提取详情卡片字段配置（预览模式从 record 取值）。 */
export function extractDetailFields(
  node: ComponentNode,
  record: Record<string, unknown>,
  ctx: RenderContext,
): DescriptionsProps['items'] {
  const raw = node.props.fields;
  if (!Array.isArray(raw)) return [];
  return raw.map((field, i) => {
    const obj = asPropObject(field);
    const label = obj && typeof obj.label === 'string' ? obj.label : `字段${i + 1}`;
    const key = obj && typeof obj.fieldId === 'string' ? obj.fieldId : String(i);
    let child: ReactNode = '—';
    if (ctx.mode === 'preview') {
      const apiName =
        obj && typeof obj.apiName === 'string'
          ? obj.apiName
          : obj && typeof obj.fieldId === 'string'
            ? obj.fieldId
            : '';
      if (apiName) {
        const val = record[apiName];
        child = val == null ? '—' : String(val);
      }
    }
    return { key, label, children: child };
  });
}

/** 从 options prop 提取下拉选项。 */
export function extractSelectOptions(node: ComponentNode): { label: string; value: string }[] {
  const raw = node.props.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((opt) => {
    const obj = asPropObject(opt);
    if (!obj) return { label: '', value: '' };
    const label = typeof obj.label === 'string' ? obj.label : '';
    const value =
      typeof obj.value === 'string' ? obj.value : typeof obj.id === 'string' ? obj.id : '';
    return { label, value };
  });
}

// ---------------------------------------------------------------------------
// 容器子节点渲染（编辑模式通过 ctx.renderDropzone 注入放置区）
// ---------------------------------------------------------------------------

/** 渲染容器子节点（编辑模式包裹放置区；预览模式直接渲染）。 */
export function renderContainerChildren(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const children = node.children ?? [];
  if (ctx.mode === 'edit' && ctx.renderDropzone) {
    return ctx.renderDropzone(node.id, children.length === 0, children.map(renderChild));
  }
  return <>{children.map(renderChild)}</>;
}

// ---------------------------------------------------------------------------
// 表单字段包裹（Form.Item + 标签 + 必填）
// ---------------------------------------------------------------------------

/** 表单字段包裹组件：Form.Item + 标签 + 必填 + 禁用。 */
export function FormFieldItem({
  node,
  ctx,
  children,
}: {
  node: ComponentNode;
  ctx: RenderContext;
  children: ReactNode;
}) {
  const label = getPropAsString(node, 'label', ctx) || node.name || '';
  const required = getPropAsBool(node, 'required', ctx);
  const disabled = getPropAsBool(node, 'disabled', ctx) || getPropAsBool(node, 'readonly', ctx);
  return (
    <Form.Item label={label || undefined} required={required} style={{ marginBottom: 16 }}>
      <div style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.6 : 1 }}>
        {children}
      </div>
    </Form.Item>
  );
}

// ---------------------------------------------------------------------------
// 页面加载副作用
// ---------------------------------------------------------------------------

/** 页面加载副作用 — 提取为独立组件以满足 React Hooks 规则。 */
export function PageLoadEffect({ node, ctx }: { node: ComponentNode; ctx: RenderContext }) {
  useEffect(() => {
    if (ctx.mode === 'preview') ctx.onAction(node.id, 'onLoad');
  }, [ctx, node.id]);
  return null;
}
