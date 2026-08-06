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
  | 'set_variable';

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
