/**
 * 页面搭建器 类型契约 —— 对标飞书 aPaaS 可视化页面搭建。
 *
 * 核心概念：
 * - **页面 Schema**：搭建器产出的元数据 JSON，含组件树 + 视图模型 + 绑定关系。
 * - **视图模型 (View Model)**：页面级状态树，组件属性通过表达式绑定到状态节点。
 * - **运行时渲染器**：递归解析组件树渲染，解析表达式绑定，调数据 API。
 *
 * @see docs/prd/PRD-page-builder.md  产品需求（待 Phase 2 产品闸门产出）
 */

import type { AppId, ISODateString, ObjectId, PageId, TenantId } from '../common/index.js';

// ---------------------------------------------------------------------------
// 组件类型
// ---------------------------------------------------------------------------

/**
 * 组件类型枚举。对标飞书 aPaaS 组件库，MVP 起步约 20 个。
 * 按职能分四大类：容器 / 数据 / 表单 / 展示。
 */
export enum ComponentType {
  // —— 容器类 ——
  Page = 'page',
  Section = 'section',
  Tabs = 'tabs',
  Grid = 'grid',
  GridColumn = 'grid_column',

  // —— 数据类 ——
  DataTable = 'data_table',
  DetailCard = 'detail_card',
  List = 'list',

  // —— 表单类 ——
  Form = 'form',
  TextInput = 'text_input',
  TextArea = 'textarea',
  NumberInput = 'number_input',
  Select = 'select',
  MultiSelect = 'multi_select',
  DatePicker = 'date_picker',
  Radio = 'radio',
  Checkbox = 'checkbox',
  Switch = 'switch',
  LookupPicker = 'lookup_picker',
  SubFormTable = 'sub_form_table',
  AttachmentUpload = 'attachment_upload',
  UserPicker = 'user_picker',

  // —— 展示类 ——
  Button = 'button',
  Statistic = 'statistic',
  Chart = 'chart',
  RichTextDisplay = 'rich_text_display',
  Divider = 'divider',
  Text = 'text',
}

/** 页面类型（标准页面模板）。 */
export enum PageType {
  ListPage = 'list_page',
  DetailPage = 'detail_page',
  FormPage = 'form_page',
  Dashboard = 'dashboard',
  Custom = 'custom',
}

// ---------------------------------------------------------------------------
// 组件树（Schema）
// ---------------------------------------------------------------------------

/**
 * 组件节点。页面 Schema 的基本单元，组成树形结构。
 * props 存具体配置，可含表达式绑定（{ __bind: 'viewmodel.xxx' }）。
 */
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

/** 组件属性 = 键值对，值为字面量或绑定表达式。 */
export type ComponentProps = Record<string, PropValue>;

/** 属性值：字面量 或 绑定表达式 或 事件动作。 */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | PropValue[]
  | { __bind: string } // 绑定到视图模型路径，如 'vm.record.name'
  | { __expr: string } // 内联表达式
  | { __action: ActionConfig } // 事件触发的动作
  | { [key: string]: PropValue };

/** 事件动作配置（如按钮 onClick 查询数据 / 提交表单 / 跳转）。 */
export interface ActionConfig {
  /** 动作类型 */
  type: ActionType;
  /** 动作参数 */
  params?: Record<string, PropValue>;
}

/** 动作类型。对标飞书 aPaaS 的组件交互能力。 */
export enum ActionType {
  /** 查询记录（填充数据组件） */
  QueryRecords = 'query_records',
  /** 新增记录 */
  CreateRecord = 'create_record',
  /** 更新记录 */
  UpdateRecord = 'update_record',
  /** 删除记录 */
  DeleteRecord = 'delete_record',
  /** 页面跳转 */
  Navigate = 'navigate',
  /** 打开弹窗 */
  OpenModal = 'open_modal',
  /** 关闭弹窗 */
  CloseModal = 'close_modal',
  /** 弹出确认框 */
  Confirm = 'confirm',
  /** 弹出提示 */
  Toast = 'toast',
  /** 调用自定义 API */
  CallApi = 'call_api',
  /** 触发流程 */
  TriggerProcess = 'trigger_process',
  /** 设置视图模型变量 */
  SetVariable = 'set_variable',
}

// ---------------------------------------------------------------------------
// 视图模型 (View Model)
// ---------------------------------------------------------------------------

/**
 * 视图模型定义 —— 飞书 aPaaS 核心概念。
 * 页面级状态树，组件属性通过表达式绑定到状态节点；
 * 状态节点可作为组件数据源，也可作为流程输入。
 */
export interface ViewModel {
  /** 状态节点定义，key = 变量路径段（如 'record' / 'list' / 'selectedId'） */
  variables: Record<string, VariableDef>;
}

/** 视图模型变量定义。 */
export interface VariableDef {
  /** 变量类型 */
  type: VariableType;
  /** 变量初始值（字面量或表达式） */
  initialValue?: PropValue;
  /** 数据源配置（type 为 record_list/record 时必填） */
  datasource?: DatasourceConfig;
  /** 描述 */
  description?: string;
}

/** 视图模型变量类型。 */
export enum VariableType {
  /** 单条记录 */
  Record = 'record',
  /** 记录列表 */
  RecordList = 'record_list',
  /** 标量（string/number/boolean） */
  Scalar = 'scalar',
  /** 对象（结构化） */
  Object = 'object',
  /** 数组 */
  Array = 'array',
}

/** 数据源配置（绑定到对象记录）。 */
export interface DatasourceConfig {
  /** 关联对象 ID */
  objectId: ObjectId;
  /** 视图 ID（使用某视图的筛选/排序） */
  viewId?: string;
  /** 是否页面加载时自动查询 */
  autoQuery: boolean;
}

// ---------------------------------------------------------------------------
// 页面 Schema
// ---------------------------------------------------------------------------

/**
 * 页面 Schema —— 搭建器的核心产出。
 * 运行时渲染器读取此 Schema 动态渲染页面。
 */
export interface PageSchema {
  /** Schema 版本 */
  version: '1';
  /** 页面类型 */
  pageType: PageType;
  /** 视图模型 */
  viewModel: ViewModel;
  /** 组件树根节点 */
  root: ComponentNode;
}

/** 页面元数据（存储于 pages 表）。 */
export interface PageMeta {
  id: PageId;
  tenantId: TenantId;
  /** 所属应用 ID */
  appId: AppId;
  name: string;
  /** 页面路径（用于运行时路由） */
  slug: string;
  type: PageType;
  /** 关联对象（列表/详情/表单页） */
  objectId?: ObjectId;
  /** 完整页面 Schema */
  schema: PageSchema;
  /** 是否发布 */
  published: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 创建页面请求。 */
export interface CreatePageRequest {
  /** 页面 API 名称（应用内唯一，用作运行时路由 slug） */
  apiName: string;
  /** 显示名称 */
  name: string;
  /** 页面类型 */
  type: PageType;
  /** 关联对象（列表/详情/表单页必填，自定义页可空） */
  objectId?: string;
  /** 页面 Schema（未提供时存空对象，后续通过 update 填充） */
  schema?: PageSchema;
}

/** 更新页面请求。 */
export interface UpdatePageRequest {
  /** 显示名称 */
  name?: string;
  /** 页面 Schema（保存搭建器产出） */
  schema?: PageSchema;
  /** 发布状态 */
  isPublished?: boolean;
}
