import client from './client.js';
import type { ApiResponse } from './client.js';

/**
 * 页面搭建器 API 封装。
 *
 * 类型契约对齐 packages/shared/src/page/index.ts(SSOT),
 * 但 Studio 不直接依赖 @apaas/shared,这里以接口形式重新声明,
 * ID 统一用 string(运行时与品牌 ID 同为 string),便于前端直接使用。
 *
 * 后端响应统一包裹为 { ok: true, data: ... },取 res.data.data。
 */

// ---------------------------------------------------------------------------
// 枚举(字符串字面量联合,对齐 shared ComponentType/PageType/ActionType/VariableType)
// ---------------------------------------------------------------------------

/** 组件类型枚举(对标飞书 aPaaS 组件库)。 */
export type ComponentType =
  // —— 容器类 ——
  | 'page'
  | 'section'
  | 'tabs'
  | 'grid'
  | 'grid_column'
  | 'dashboard_grid'
  // —— 数据类 ——
  | 'data_table'
  | 'detail_card'
  | 'list'
  // —— 表单类 ——
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
  // —— 展示类 ——
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
  | 'matrix_table'
  | 'statistic_group'
  | 'filter'
  | 'sort'
  | 'audit_list'
  | 'tree_list_single'
  | 'tree_list_multi';

/** 页面类型(标准页面模板)。 */
export type PageType = 'list_page' | 'detail_page' | 'form_page' | 'dashboard' | 'custom';

/** 动作类型(组件事件触发的动作)。 */
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

/** 视图模型变量类型。 */
export type VariableType = 'record' | 'record_list' | 'scalar' | 'object' | 'array';

// ---------------------------------------------------------------------------
// 组件树(Schema)
// ---------------------------------------------------------------------------

/** 事件动作配置。 */
export interface ActionConfig {
  type: ActionType;
  params?: Record<string, PropValue>;
}

/** 属性值:字面量 或 绑定表达式 或 事件动作。 */
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

/** 组件属性 = 键值对,值为字面量或绑定表达式。 */
export type ComponentProps = Record<string, PropValue>;

/** 组件节点。页面 Schema 的基本单元,组成树形结构。 */
export interface ComponentNode {
  /** 节点唯一 ID(页面内) */
  id: string;
  type: ComponentType;
  /** 组件实例名称(搭建器中显示) */
  name?: string;
  /** 组件属性,值可为字面量或绑定表达式 */
  props: ComponentProps;
  /** 子节点(容器类组件) */
  children?: ComponentNode[];
  /** 是否隐藏(可绑定表达式) */
  hidden?: boolean | { __bind: string };
}

// ---------------------------------------------------------------------------
// 视图模型
// ---------------------------------------------------------------------------

/** 数据源配置(绑定到对象记录)。 */
export interface DatasourceConfig {
  objectId: string;
  viewId?: string;
  autoQuery: boolean;
}

/** 视图模型变量定义。 */
export interface VariableDef {
  type: VariableType;
  initialValue?: PropValue;
  datasource?: DatasourceConfig;
  description?: string;
}

/** 视图模型定义 —— 页面级状态树。 */
export interface ViewModel {
  variables: Record<string, VariableDef>;
}

// ---------------------------------------------------------------------------
// 页面 Schema / 元数据
// ---------------------------------------------------------------------------

/** 页面 Schema —— 搭建器的核心产出。 */
export interface PageSchema {
  version: '1';
  pageType: PageType;
  viewModel: ViewModel;
  root: ComponentNode;
}

/** 页面元数据(存储于 pages 表)。 */
export interface PageMeta {
  id: string;
  tenantId?: string;
  appId: string;
  name: string;
  /** 页面 API 名称（应用内唯一，后端映射为 slug） */
  apiName: string;
  type: PageType;
  /** 关联对象(列表/详情/表单页) */
  objectId?: string;
  /** 完整页面 Schema */
  schema: PageSchema;
  /** 是否发布 */
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 请求体
// ---------------------------------------------------------------------------

export interface CreatePageRequest {
  name: string;
  apiName: string;
  type: PageType;
  objectId?: string;
  schema?: PageSchema;
}

export interface UpdatePageRequest {
  name?: string;
  apiName?: string;
  type?: PageType;
  objectId?: string;
  schema?: PageSchema;
  published?: boolean;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const pagesApi = {
  /** 页面列表 */
  list: (appId: string) =>
    client
      .get<ApiResponse<PageMeta[]>>(`/api/apps/${appId}/pages`)
      .then((res) => res.data.data as PageMeta[]),

  /** 页面详情(含 Schema) */
  get: (pageId: string) =>
    client
      .get<ApiResponse<PageMeta>>(`/api/pages/${pageId}`)
      .then((res) => res.data.data as PageMeta),

  /** 创建页面 */
  create: (appId: string, data: CreatePageRequest) =>
    client
      .post<ApiResponse<PageMeta>>(`/api/apps/${appId}/pages`, data)
      .then((res) => res.data.data as PageMeta),

  /** 更新页面(含 Schema 持久化) */
  update: (pageId: string, data: UpdatePageRequest) =>
    client
      .put<ApiResponse<PageMeta>>(`/api/pages/${pageId}`, data)
      .then((res) => res.data.data as PageMeta),

  /** 删除页面 */
  delete: (pageId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/pages/${pageId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 发布页面 */
  publish: (pageId: string) =>
    client
      .post<ApiResponse<PageMeta>>(`/api/pages/${pageId}/publish`)
      .then((res) => res.data.data as PageMeta),
};
