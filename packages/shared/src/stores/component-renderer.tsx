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

import { Component, type ErrorInfo, type ReactNode } from 'react';
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
import {
  renderProgressChart,
  renderMatrixTable,
  renderStatisticGroup,
} from './renderers-display-ext.js';
import {
  renderPagination,
  renderSteps,
  renderCollapsePanel,
  renderCarousel,
  renderButtonGroup,
  renderFlatFilter,
  renderModalDialog,
  renderDrawer,
  renderPopoverCard,
} from './renderers-layout-ext.js';
import {
  renderEmailInput,
  renderPhoneInput,
  renderUserPickerMulti,
  renderLookupPickerMulti,
  renderImageUpload,
  renderRichTextInput,
  renderCascaderSingle,
  renderCascaderMulti,
  renderTreeSelectSingle,
  renderTreeSelectMulti,
} from './renderers-form-ext.js';
import {
  renderIcon,
  renderImage,
  renderTag,
  renderLink,
  renderQrcode,
  renderAlert,
  renderNumberDisplay,
  renderDatetimeDisplay,
  renderUserDisplay,
  renderFileDisplay,
  renderIframe,
  renderMarkdownDisplay,
} from './renderers-display-ext.js';

// ---------------------------------------------------------------------------
// 组件渲染器注册表
// ---------------------------------------------------------------------------

/** 全部组件渲染器（studio 超集形式；批次C1 扩展后 39 个）。 */
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

  // —— 展示类·扩展（页面模块对齐批次C1） ——
  icon: renderIcon,
  image: renderImage,
  tag: renderTag,
  link: renderLink,
  qrcode: renderQrcode,
  alert: renderAlert,
  number_display: renderNumberDisplay,
  datetime_display: renderDatetimeDisplay,
  user_display: renderUserDisplay,
  file_display: renderFileDisplay,
  iframe: renderIframe,
  markdown: renderMarkdownDisplay,

  // —— 表单类·扩展（页面模块对齐批次C2） ——
  email_input: renderEmailInput,
  phone_input: renderPhoneInput,
  user_picker_multi: renderUserPickerMulti,
  lookup_picker_multi: renderLookupPickerMulti,
  image_upload: renderImageUpload,
  rich_text_input: renderRichTextInput,
  cascader_single: renderCascaderSingle,
  cascader_multi: renderCascaderMulti,
  tree_select_single: renderTreeSelectSingle,
  tree_select_multi: renderTreeSelectMulti,

  // —— 布局导航弹层·扩展（页面模块对齐批次C3） ——
  pagination: renderPagination,
  steps: renderSteps,
  collapse_panel: renderCollapsePanel,
  carousel: renderCarousel,
  button_group: renderButtonGroup,
  flat_filter: renderFlatFilter,
  modal_dialog: renderModalDialog,
  drawer: renderDrawer,
  popover_card: renderPopoverCard,

  // —— 图表·扩展（页面模块对齐批次C4；变体复用 renderChart + defaultProps.chartType） ——
  chart_radar: renderChart,
  chart_area: renderChart,
  chart_scatter: renderChart,
  chart_bar_horizontal: renderChart,
  chart_waterfall: renderChart,
  chart_wordcloud: renderChart,
  chart_combo: renderChart,
  progress_chart: renderProgressChart,
  matrix_table: renderMatrixTable,
  statistic_group: renderStatisticGroup,
};

// ---------------------------------------------------------------------------
// 错误边界 + 未知类型降级
// ---------------------------------------------------------------------------

/**
 * 节点级错误边界 — 单个节点渲染失败仅降级该节点，不影响整页。
 *
 * 页面 Schema 内容是用户编写的（低代码平台），坏 schema/未知类型/坏属性
 * 不应导致 Studio 预览或运行时整页白屏。
 */
class NodeErrorBoundary extends Component<
  { node: ComponentNode; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ComponentRenderer] 节点渲染失败 type=${this.props.node.type} id=${this.props.node.id}:`,
      error,
      info.componentStack,
    );
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            border: '1px dashed #ffccc7',
            background: '#fff1f0',
            color: '#cf1322',
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
          }}
        >
          组件渲染失败（{this.props.node.type}）
        </div>
      );
    }
    return this.props.children;
  }
}

/** 未知节点类型的降级占位（Schema 可能来自旧版本/外部导入）。 */
function renderUnknownType(node: ComponentNode): ReactNode {
  return (
    <div
      style={{
        border: '1px dashed #d9d9d9',
        color: '#999',
        padding: '4px 8px',
        fontSize: 12,
        borderRadius: 4,
      }}
    >
      未知组件类型（{node.type}）
    </div>
  );
}

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

/** 预览模式纯渲染：调用 RENDERERS[node.type]（或自定义覆盖）。未知类型降级占位。 */
export function PreviewNode({ node, ctx, renderChild, renderers }: PreviewNodeProps): ReactNode {
  const registry = renderers ?? RENDERERS;
  const renderer = registry[node.type];
  if (!renderer) return renderUnknownType(node);
  return renderer(node, ctx, renderChild);
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
  return (node, ctx, renderChild) => {
    const renderer = registry[node.type];
    if (!renderer) return renderUnknownType(node);
    return renderer(node, ctx, renderChild);
  };
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

    const renderer = customRenderers[node.type];
    const content = (
      <NodeErrorBoundary node={node}>
        {renderer ? renderer(node, ctx, renderChild) : renderUnknownType(node)}
      </NodeErrorBoundary>
    );

    if (ctx.mode === 'edit' && wrapEdit) {
      return wrapEdit({ node, ctx, content, isRoot });
    }
    return content;
  }

  return ComponentRendererShared;
}
