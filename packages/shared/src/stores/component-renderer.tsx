/**
 * 共享组件渲染器 — Studio（编辑 + 预览）与 Runtime-UI（纯预览）共用。
 *
 * 从两包的 ComponentRenderer.tsx 提取共享逻辑：
 * - 渲染上下文（RenderContext，超集：含 mode / edit-mode 放置区回调）
 * - 属性读取辅助（getProp / getPropAsString / ...）
 * - 全部 26 个组件渲染器（studio 超集形式，edit-mode 分支由 ctx.mode === 'edit' 守卫）
 * - PreviewNode 组件 + createComponentRenderer 工厂
 *
 * Studio 通过 createComponentRenderer({ wrapEdit: EditNode }) 注入编辑模式包裹层；
 * Runtime-UI 通过 createComponentRenderer({ renderers: { chart: ... } }) 覆盖图表渲染器。
 *
 * 文件拆分（单文件 ≤400 行）：
 * - renderer-helpers.tsx — 类型 + 辅助函数 + 共享组件（renderContainerChildren / FormFieldItem / PageLoadEffect）
 * - renderers-container.tsx — 容器类渲染器（page / section / tabs / grid / grid_column / dashboard_grid）
 * - renderers-data.tsx — 数据类渲染器（data_table / detail_card / list）
 * - renderers-form.tsx — 表单类渲染器（form → user_picker 共 14 个）
 * - renderers-display.tsx — 展示类渲染器（button / statistic / chart / rich_text_display / divider / text）
 * - component-renderer.tsx（本文件）— re-export helpers + RENDERERS 注册表 + PreviewNode + 工厂函数
 */

import type { ReactNode } from 'react';
import type { ComponentNode, ComponentType } from './types.js';

// 重新导出类型与辅助函数（保持 index.ts 的 export * 向后兼容）
export * from './renderer-helpers.js';

// 导入类型与辅助函数（本文件内部使用）
import type { RenderContext, RenderChild, RendererFn } from './renderer-helpers.js';
import { shouldHide } from './renderer-helpers.js';

// 导入渲染器函数
import {
  renderPage,
  renderSection,
  renderTabs,
  renderGrid,
  renderGridColumn,
  renderDashboardGrid,
} from './renderers-container.js';
import { renderDataTable, renderDetailCard, renderList } from './renderers-data.js';
import {
  renderForm,
  renderTextInput,
  renderTextArea,
  renderNumberInput,
  renderSelect,
  renderMultiSelect,
  renderDatePicker,
  renderRadio,
  renderCheckbox,
  renderSwitch,
  renderLookupPicker,
  renderSubFormTable,
  renderAttachmentUpload,
  renderUserPicker,
} from './renderers-form.js';
import {
  renderButton,
  renderStatistic,
  renderChart,
  renderRichTextDisplay,
  renderDivider,
  renderText,
} from './renderers-display.js';

// ---------------------------------------------------------------------------
// 组件渲染器注册表
// ---------------------------------------------------------------------------

/** 全部 27 个组件渲染器（studio 超集形式）。 */
export const RENDERERS: Record<ComponentType, RendererFn> = {
  // —— 容器类 ——
  page: renderPage,
  section: renderSection,
  tabs: renderTabs,
  grid: renderGrid,
  grid_column: renderGridColumn,
  dashboard_grid: renderDashboardGrid,

  // —— 数据类 ——
  data_table: renderDataTable,
  detail_card: renderDetailCard,
  list: renderList,

  // —— 表单类 ——
  form: renderForm,
  text_input: renderTextInput,
  textarea: renderTextArea,
  number_input: renderNumberInput,
  select: renderSelect,
  multi_select: renderMultiSelect,
  date_picker: renderDatePicker,
  radio: renderRadio,
  checkbox: renderCheckbox,
  switch: renderSwitch,
  lookup_picker: renderLookupPicker,
  sub_form_table: renderSubFormTable,
  attachment_upload: renderAttachmentUpload,
  user_picker: renderUserPicker,

  // —— 展示类 ——
  button: renderButton,
  statistic: renderStatistic,
  chart: renderChart,
  rich_text_display: renderRichTextDisplay,
  divider: renderDivider,
  text: renderText,
};

// ---------------------------------------------------------------------------
// PreviewNode 组件
// ---------------------------------------------------------------------------

/** PreviewNode 属性。 */
export interface PreviewNodeProps {
  node: ComponentNode;
  ctx: RenderContext;
  renderChild: RenderChild;
  /** 自定义渲染器覆盖（如 runtime-ui 的 chart 数据集渲染）。 */
  renderers?: Record<ComponentType, RendererFn>;
}

/** 预览模式纯渲染：调用 RENDERERS[node.type]（或自定义覆盖）。 */
export function PreviewNode({ node, ctx, renderChild, renderers }: PreviewNodeProps): ReactNode {
  const registry = renderers ?? RENDERERS;
  return registry[node.type](node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// createRenderer 函数
// ---------------------------------------------------------------------------

/**
 * 创建渲染函数（不含递归 / 隐藏判定，仅查找 RENDERERS 并调用）。
 *
 * 用于需要直接调用渲染器（而非通过组件递归）的场景。
 */
export function createRenderer(
  renderers?: Record<ComponentType, RendererFn>,
): (node: ComponentNode, ctx: RenderContext, renderChild: RenderChild) => ReactNode {
  const registry = renderers ?? RENDERERS;
  return (node, ctx, renderChild) => registry[node.type](node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// createComponentRenderer 工厂
// ---------------------------------------------------------------------------

/** 共享渲染器属性。 */
export interface ComponentRendererSharedProps {
  node: ComponentNode;
  isRoot?: boolean;
  ctx: RenderContext;
}

/** 编辑模式包裹层属性（Studio 的 EditNode 实现）。 */
export interface WrapEditProps {
  node: ComponentNode;
  ctx: RenderContext;
  content: ReactNode;
  isRoot?: boolean;
}

/** createComponentRenderer 工厂选项。 */
export interface CreateComponentRendererOptions {
  /** 自定义渲染器覆盖（如 runtime-ui 的 chart 数据集渲染）。 */
  renderers?: Partial<Record<ComponentType, RendererFn>>;
  /** 编辑模式包裹层（studio 注入 EditNode）。 */
  wrapEdit?: (props: WrapEditProps) => ReactNode;
}

/**
 * 创建组件渲染器组件。
 *
 * - 预览模式：检查 shouldHide → 调用 RENDERERS → 返回内容
 * - 编辑模式：调用 RENDERERS → 通过 wrapEdit 包裹 EditNode → 返回
 * - 递归：renderChild 创建 <ComponentRendererShared> 子节点
 *
 * Studio 通过 wrapEdit 注入编辑模式包裹层；
 * Runtime-UI 通过 renderers 覆盖图表渲染器。
 */
export function createComponentRenderer(
  options?: CreateComponentRendererOptions,
): (props: ComponentRendererSharedProps) => ReactNode {
  const customRenderers = options?.renderers ? { ...RENDERERS, ...options.renderers } : RENDERERS;
  const wrapEdit = options?.wrapEdit;

  function ComponentRendererShared({ node, isRoot, ctx }: ComponentRendererSharedProps): ReactNode {
    // 预览模式：隐藏表达式求值为真则不渲染
    if (ctx.mode === 'preview' && shouldHide(node, ctx.vm)) {
      return null;
    }

    const renderChild: RenderChild = (child) => (
      <ComponentRendererShared key={child.id} node={child} ctx={ctx} />
    );

    const content = customRenderers[node.type](node, ctx, renderChild);

    if (ctx.mode === 'edit' && wrapEdit) {
      return wrapEdit({ node, ctx, content, isRoot });
    }
    return content;
  }

  return ComponentRendererShared;
}
