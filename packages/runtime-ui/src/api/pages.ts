/**
 * 页面 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的 /api/apps/:appId/pages 和 /api/pages 端点。
 * 类型从 studio api/pages.ts 精简复制（仅运行时所需）。
 */

import apiClient from './client';

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

export type ComponentType =
  | 'page'
  | 'section'
  | 'tabs'
  | 'grid'
  | 'grid_column'
  | 'dashboard_grid'
  | 'data_table'
  | 'detail_card'
  | 'list'
  | 'form'
  | 'text_input'
  | 'textarea'
  | 'number_input'
  | 'select'
  | 'multi_select'
  | 'date_picker'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'lookup_picker'
  | 'sub_form_table'
  | 'attachment_upload'
  | 'user_picker'
  // —— 表单类·扩展（页面模块对齐批次C2） ——
  | 'email_input'
  | 'phone_input'
  | 'user_picker_multi'
  | 'lookup_picker_multi'
  | 'image_upload'
  | 'rich_text_input'
  | 'cascader_single'
  | 'cascader_multi'
  | 'tree_select_single'
  | 'tree_select_multi'
  | 'button'
  | 'statistic'
  | 'chart'
  | 'rich_text_display'
  | 'divider'
  | 'text'
  // —— 展示类·扩展（页面模块对齐批次C1） ——
  | 'icon'
  | 'image'
  | 'tag'
  | 'link'
  | 'qrcode'
  | 'alert'
  | 'number_display'
  | 'datetime_display'
  | 'user_display'
  | 'file_display'
  | 'iframe'
  | 'markdown'
  // —— 布局导航弹层·扩展（页面模块对齐批次C3） ——
  | 'pagination'
  | 'steps'
  | 'collapse_panel'
  | 'carousel'
  | 'button_group'
  | 'flat_filter'
  | 'modal_dialog'
  | 'drawer'
  | 'popover_card'
  // —— 图表·扩展（页面模块对齐批次C4） ——
  | 'chart_radar'
  | 'chart_area'
  | 'chart_scatter'
  | 'chart_bar_horizontal'
  | 'chart_waterfall'
  | 'chart_wordcloud'
  | 'chart_combo'
  | 'progress_chart'
  | 'matrix_table'
  | 'statistic_group'
  | 'filter'
  | 'sort'
  | 'audit_list'
  | 'tree_list_single'
  | 'tree_list_multi'
  // —— 业务审批·扩展（页面模块对齐批次C6） ——
  | 'profile_center'
  | 'notification_list'
  | 'task_detail'
  | 'my_tasks'
  | 'approval_admin'
  // —— 收尾·扩展（页面模块对齐批次C7） ——
  | 'html_display'
  | 'jsx_display'
  | 'dept_picker'
  | 'dept_picker_multi'
  | 'region_cascader_single'
  | 'region_cascader_multi';

export type PageType = 'list_page' | 'detail_page' | 'form_page' | 'dashboard' | 'custom';

export type ActionType =
  | 'query_records'
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'navigate'
  | 'open_modal'
  | 'close_modal'
  | 'confirm'
  | 'toast'
  | 'call_api'
  | 'trigger_process'
  | 'set_variable'
  | 'run_script';

export type VariableType = 'record' | 'record_list' | 'scalar' | 'object' | 'array';

// ---------------------------------------------------------------------------
// 组件树 (Schema)
// ---------------------------------------------------------------------------

export interface ActionConfig {
  type: ActionType;
  params?: Record<string, PropValue>;
}

export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | { __bind: string }
  | { __expr: string }
  | { __action: ActionConfig }
  | { [key: string]: PropValue };

export type ComponentProps = Record<string, PropValue>;

export interface ComponentNode {
  id: string;
  type: ComponentType;
  name?: string;
  props: ComponentProps;
  children?: ComponentNode[];
  hidden?: boolean | { __bind: string };
}

// ---------------------------------------------------------------------------
// 视图模型
// ---------------------------------------------------------------------------

export interface DatasourceConfig {
  objectId: string;
  viewId?: string;
  autoQuery: boolean;
}

export interface VariableDef {
  type: VariableType;
  initialValue?: PropValue;
  datasource?: DatasourceConfig;
  description?: string;
}

export interface ViewModel {
  variables: Record<string, VariableDef>;
}

// ---------------------------------------------------------------------------
// 页面 Schema / 元数据
// ---------------------------------------------------------------------------

export interface PageSchema {
  version: '1';
  pageType: PageType;
  viewModel: ViewModel;
  root: ComponentNode;
  /** 全局 CSS（预览/运行时注入页面，可选） */
  globalCss?: string;
  /** 全局 JS（页面挂载后执行一次，可选） */
  globalJs?: string;
  /** 页面多语文案（可选）：默认语言 + 各 locale 的 key→文案 表 */
  i18n?: {
    defaultLocale?: string;
    locales: Record<string, Record<string, string>>;
  };
}

export interface PageMeta {
  id: string;
  tenantId?: string;
  appId: string;
  name: string;
  /** 页面路径标识（后端 Prisma apiName 映射为 slug 返回） */
  slug: string;
  type: PageType;
  objectId?: string;
  schema: PageSchema;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const pagesApi = {
  /** 列出应用下已发布页面 */
  list: (appId: string) =>
    apiClient.get(`/apps/${appId}/pages`).then((res) => res.data.data as PageMeta[]),

  /** 按 ID 获取页面详情 */
  get: (pageId: string) =>
    apiClient.get(`/pages/${pageId}`).then((res) => res.data.data as PageMeta),

  /** 按 slug 获取已发布页面（运行时渲染用） */
  getBySlug: (appId: string, slug: string) =>
    apiClient.get(`/apps/${appId}/pages/slug/${slug}`).then((res) => res.data.data as PageMeta),
};
