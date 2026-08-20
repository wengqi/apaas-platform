/**
 * 对象 / 数据建模 类型契约 —— 低代码平台的数据基石。
 *
 * 对标飞书 aPaaS：用户定义业务实体(对象)，配置字段与关联，
 * 系统基于元数据提供记录 CRUD 与查询。存储采用 JSONB 宽表方案。
 *
 * @see docs/prd/PRD-object.md  产品需求（待 Phase 1 产品闸门产出）
 */

import type {
  AppId,
  FieldId,
  ISODateString,
  ObjectId,
  SortParam,
  TenantId,
  UserId,
  ViewId,
} from '../common/index.js';

// ---------------------------------------------------------------------------
// 字段类型
// ---------------------------------------------------------------------------

/**
 * 字段类型枚举。对标飞书 aPaaS 的字段类型体系。
 * 运行时数据以 JSONB 存储，字段类型决定校验与查询行为。
 */
export enum FieldType {
  /** 单行文本 */
  Text = 'text',
  /** 多行文本 / 长文本 */
  LongText = 'long_text',
  /** 富文本（HTML） */
  RichText = 'rich_text',
  /** 数字（整数/小数，可配置精度） */
  Number = 'number',
  /** 金额（带货币符号） */
  Currency = 'currency',
  /** 百分比 */
  Percent = 'percent',
  /** 自动编号（如 ORD-0001） */
  AutoNumber = 'auto_number',
  /** 单选 */
  SingleSelect = 'single_select',
  /** 多选 */
  MultiSelect = 'multi_select',
  /** 日期 */
  Date = 'date',
  /** 日期时间 */
  DateTime = 'date_time',
  /** 复选框 / 布尔 */
  Checkbox = 'checkbox',
  /** 附件 / 文件 */
  Attachment = 'attachment',
  /** 人员（引用系统用户） */
  User = 'user',
  /** 关联其他对象（多对一） */
  Lookup = 'lookup',
  /** 子表 / 明细（一对多，主从关系） */
  SubForm = 'sub_form',
  /** 公式（由表达式计算） */
  Formula = 'formula',
  /** 汇总（聚合关联对象的值） */
  Rollup = 'rollup',
}

/** 字段类型 → 运行时存储值类型（JSONB 中的实际类型）。 */
export type FieldValue = string | number | boolean | null | string[] | Record<string, unknown>;

/** 单选项定义。 */
export interface SelectOption {
  id: string;
  label: string;
  color?: string;
  /** 是否默认选中（单选仅一个可为 true） */
  isDefault?: boolean;
}

/** 关联字段配置。 */
export interface LookupConfig {
  /** 关联的目标对象 ID */
  targetObjectId: ObjectId;
  /** 关联关系类型 */
  relationType: RelationType;
  /** 在目标对象上显示的引用字段名（反向关联） */
  inverseFieldName?: string;
}

/** 关联关系类型。 */
export enum RelationType {
  /** 一对多（lookup 字段所在对象为“多”方） */
  OneToMany = 'one_to_many',
  /** 多对多（通过中间对象实现） */
  ManyToMany = 'many_to_many',
}

/** 子表字段配置。 */
export interface SubFormConfig {
  /** 子对象 ID（明细对象） */
  childObjectId: ObjectId;
  /** 主从关联字段（子对象中指向父记录的 lookup 字段 ID） */
  parentFieldId: FieldId;
}

/** 公式字段配置。 */
export interface FormulaConfig {
  /** 表达式（使用平台表达式引擎语法） */
  expression: string;
  /** 公式返回值类型 */
  returnType: FieldType.Number | FieldType.Text | FieldType.Date | FieldType.Currency;
}

/** 数字字段配置。 */
export interface NumberConfig {
  /** 小数位数 */
  precision: number;
}

/** 自动编号配置。 */
export interface AutoNumberConfig {
  /** 编号规则，如 'ORD-{seq:0000}' */
  format: string;
}

/** 字段定义（元数据）。一个字段属于一个对象。 */
export interface Field {
  id: FieldId;
  objectId: ObjectId;
  /** API 名称（小写下划线，唯一，如 'customer_name'） */
  apiName: string;
  /** 显示名称 */
  label: string;
  type: FieldType;
  /** 该类型的配置（联合类型，按 type 区分） */
  config: FieldConfig;
  /** 是否必填 */
  required: boolean;
  /** 是否唯一 */
  unique: boolean;
  /** 是否可搜索 */
  searchable: boolean;
  /** 默认值（表达式或字面量） */
  defaultValue?: FieldValue | { __expr: string };
  /** 字段描述 */
  description?: string;
  /** 是否系统字段（如 id/created_at，不可删除） */
  isSystem: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 按 FieldType 收窄的字段配置联合。 */
export type FieldConfig =
  | { type: FieldType.Text | FieldType.LongText | FieldType.RichText; maxLength?: number }
  | { type: FieldType.Number; number: NumberConfig }
  | { type: FieldType.Currency; currency: NumberConfig & { code: string } }
  | { type: FieldType.Percent; number: NumberConfig }
  | { type: FieldType.AutoNumber; autoNumber: AutoNumberConfig }
  | { type: FieldType.SingleSelect | FieldType.MultiSelect; options: SelectOption[] }
  | { type: FieldType.Date | FieldType.DateTime; format?: string }
  | { type: FieldType.Checkbox }
  | { type: FieldType.Attachment }
  | { type: FieldType.User; multi?: boolean }
  | { type: FieldType.Lookup; lookup: LookupConfig }
  | { type: FieldType.SubForm; subForm: SubFormConfig }
  | { type: FieldType.Formula; formula: FormulaConfig }
  | {
      type: FieldType.Rollup;
      rollup: { targetFieldId: FieldId; aggregate: 'sum' | 'avg' | 'count' | 'min' | 'max' };
    };

// ---------------------------------------------------------------------------
// 对象
// ---------------------------------------------------------------------------

/**
 * 对象定义（元数据）。一个业务实体，如“客户”“订单”。
 * 存储于 objects 表；运行时记录存于通用 records 表（JSONB 宽表）。
 */
export interface ObjectMeta {
  id: ObjectId;
  tenantId: TenantId;
  /** 所属应用 ID */
  appId: AppId;
  /** API 名称（小写下划线，应用内唯一，如 'sales_order'） */
  apiName: string;
  /** 显示名称 */
  label: string;
  /** 复数显示名称（用于列表标题） */
  labelPlural?: string;
  /** 图标标识 */
  icon?: string;
  /** 主显示字段 ID（记录标题用，通常关联到某文本字段） */
  nameFieldId?: FieldId;
  /** 对象描述 */
  description?: string;
  /** 是否系统对象（不可删除） */
  isSystem: boolean;
  /** 记录是否启用记录级权限 */
  recordLevelSecurity: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** 创建者 */
  createdBy: UserId;
}

/** 对象 + 其下字段（常用聚合视图）。 */
export interface ObjectWithFields extends ObjectMeta {
  fields: Field[];
}

// ---------------------------------------------------------------------------
// 视图
// ---------------------------------------------------------------------------

/** 视图类型。对标飞书 aPaaS 的视图能力。 */
export enum ViewType {
  /** 列表视图（表格形式，含筛选/排序/分组/字段显隐） */
  List = 'list',
  /** 详情视图 */
  Detail = 'detail',
  /** 表单视图（新增/编辑） */
  Form = 'form',
  /** 看板视图 */
  Kanban = 'kanban',
  /** 日历视图 */
  Calendar = 'calendar',
  /** 画廊视图 */
  Gallery = 'gallery',
}

/** 筛选条件操作符。 */
export enum FilterOperator {
  Equal = 'eq',
  NotEqual = 'ne',
  Contains = 'contains',
  NotContains = 'not_contains',
  StartsWith = 'starts_with',
  EndsWith = 'ends_with',
  GreaterThan = 'gt',
  GreaterThanOrEqual = 'gte',
  LessThan = 'lt',
  LessThanOrEqual = 'lte',
  IsEmpty = 'is_empty',
  IsNotEmpty = 'is_not_empty',
  In = 'in',
  NotIn = 'not_in',
  /** 相对当前时间的判断（用于日期字段） */
  RelativeDate = 'relative_date',
}

/** 视图字段显隐配置。 */
export interface ViewFieldConfig {
  fieldId: FieldId;
  /** 显示顺序 */
  order: number;
  /** 列宽（列表视图，像素） */
  width?: number;
}

/** 视图定义（元数据）。 */
export interface View {
  id: ViewId;
  objectId: ObjectId;
  tenantId: TenantId;
  name: string;
  type: ViewType;
  /** 筛选条件（JsonLogic JSON） */
  filters?: object | null;
  /** 默认排序 */
  sorts?: SortParam[];
  /** 分组字段 ID */
  groupByFieldId?: FieldId;
  /** 字段显隐与顺序 */
  fields: ViewFieldConfig[];
  /** 看板/日历等视图的特化配置 */
  layoutConfig?: Record<string, unknown>;
  isDefault: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
