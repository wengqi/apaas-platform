/**
 * 运行时前端共享类型 — 跨 studio / runtime-ui 使用。
 *
 * 从 studio 的 api/pages.ts 提取，消除两包的类型重复定义。
 */

// ---------------------------------------------------------------------------
// 动作类型
// ---------------------------------------------------------------------------

/** 动作类型（组件事件触发的动作）。 */
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

/** 事件动作配置。 */
export interface ActionConfig {
  type: ActionType;
  params?: Record<string, PropValue>;
  /** 动作执行条件（扩展字段，PRD §6.3）。 */
  condition?: { __expr?: string };
}

// ---------------------------------------------------------------------------
// 属性值（PropValue）
// ---------------------------------------------------------------------------

/** 属性值：字面量 或 绑定表达式 或 事件动作。 */
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

/** 组件属性 = 键值对，值为字面量或绑定表达式。 */
export type ComponentProps = Record<string, PropValue>;

// ---------------------------------------------------------------------------
// 组件类型 / 组件节点
// ---------------------------------------------------------------------------

/**
 * 组件类型枚举（字符串字面量联合，对齐各包 api/pages.ts 定义）。
 * 对标飞书 aPaaS 组件库，按职能分四大类：容器 / 数据 / 表单 / 展示。
 */
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

/** 组件节点。页面 Schema 的基本单元，组成树形结构。 */
export interface ComponentNode {
  /** 节点唯一 ID（页面内） */
  id: string;
  type: ComponentType;
  /** 组件实例名称（搭建器中显示） */
  name?: string;
  /** 组件属性，值可为字面量或绑定表达式 */
  props: ComponentProps;
  /** 子节点（容器类组件） */
  children?: ComponentNode[];
  /** 是否隐藏（可绑定表达式） */
  hidden?: boolean | { __bind: string };
}

// ---------------------------------------------------------------------------
// 视图模型
// ---------------------------------------------------------------------------

/** 视图模型变量类型。 */
export type VariableType = 'record' | 'record_list' | 'scalar' | 'object' | 'array';

/** 数据源配置（绑定到对象记录）。 */
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

/** 视图模型定义 — 页面级状态树。 */
export interface ViewModel {
  variables: Record<string, VariableDef>;
}
