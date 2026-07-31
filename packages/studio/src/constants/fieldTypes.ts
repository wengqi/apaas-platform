import {
  FontSizeOutlined,
  AlignLeftOutlined,
  BoldOutlined,
  NumberOutlined,
  DollarOutlined,
  PercentageOutlined,
  FieldNumberOutlined,
  TagOutlined,
  TagsOutlined,
  CheckSquareOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  PaperClipOutlined,
  UserOutlined,
  LinkOutlined,
  TableOutlined,
  FunctionOutlined,
  CalculatorOutlined,
} from '@ant-design/icons';

/**
 * 字段类型枚举(对齐 packages/shared/src/object/index.ts 的 FieldType,SSOT)。
 * Studio 不直接依赖 @apaas/shared,这里以字符串字面量联合重新声明,保持一致。
 */
export type FieldType =
  | 'text'
  | 'long_text'
  | 'rich_text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'auto_number'
  | 'single_select'
  | 'multi_select'
  | 'date'
  | 'date_time'
  | 'checkbox'
  | 'attachment'
  | 'user'
  | 'lookup'
  | 'sub_form'
  | 'formula'
  | 'rollup';

/** AntD 图标组件类型(所有 @ant-design/icons 共享同一类型)。 */
type IconType = typeof FontSizeOutlined;

/** 字段类型元数据。 */
export interface FieldTypeMeta {
  /** 中文显示名 */
  label: string;
  /** 图标组件 */
  icon: IconType;
  /** AntD Tag 预设色 */
  color: string;
  /** 简短描述(类型选择器展示) */
  description: string;
}

/**
 * 字段类型元数据表 —— 单一数据源,驱动类型选择器、表格类型列、表单渲染。
 * 图标全部来自 @ant-design/icons(已验证可用)。
 */
export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text: { label: '单行文本', icon: FontSizeOutlined, color: 'blue', description: '短文本,如名称、标题' },
  long_text: { label: '多行文本', icon: AlignLeftOutlined, color: 'blue', description: '较长文本,如备注、说明' },
  rich_text: { label: '富文本', icon: BoldOutlined, color: 'blue', description: '支持格式的文本' },
  number: { label: '数字', icon: NumberOutlined, color: 'geekblue', description: '整数或小数' },
  currency: { label: '金额', icon: DollarOutlined, color: 'geekblue', description: '带货币符号的数值' },
  percent: { label: '百分比', icon: PercentageOutlined, color: 'geekblue', description: '百分比数值' },
  auto_number: { label: '自动编号', icon: FieldNumberOutlined, color: 'geekblue', description: '自动生成的序号' },
  single_select: { label: '单选', icon: TagOutlined, color: 'purple', description: '从选项中选择一个' },
  multi_select: { label: '多选', icon: TagsOutlined, color: 'purple', description: '从选项中选择多个' },
  checkbox: { label: '复选框', icon: CheckSquareOutlined, color: 'purple', description: '是 / 否布尔值' },
  date: { label: '日期', icon: CalendarOutlined, color: 'green', description: '如 2024-01-01' },
  date_time: { label: '日期时间', icon: ClockCircleOutlined, color: 'green', description: '精确到时分秒' },
  attachment: { label: '附件', icon: PaperClipOutlined, color: 'orange', description: '文件附件' },
  user: { label: '人员', icon: UserOutlined, color: 'cyan', description: '关联系统用户' },
  lookup: { label: '关联', icon: LinkOutlined, color: 'cyan', description: '关联其他对象' },
  sub_form: { label: '子表', icon: TableOutlined, color: 'cyan', description: '一对多子表记录' },
  formula: { label: '公式', icon: FunctionOutlined, color: 'magenta', description: '由表达式计算' },
  rollup: { label: '汇总', icon: CalculatorOutlined, color: 'magenta', description: '聚合关联对象的值' },
};

/** 字段类型选择器分组(对齐 DESIGN §3.3)。 */
export const FIELD_TYPE_GROUPS: { title: string; types: FieldType[] }[] = [
  { title: '文本', types: ['text', 'long_text', 'rich_text'] },
  { title: '数值', types: ['number', 'currency', 'percent', 'auto_number'] },
  { title: '选择', types: ['single_select', 'multi_select', 'checkbox'] },
  { title: '日期', types: ['date', 'date_time'] },
  { title: '媒体', types: ['attachment'] },
  { title: '引用', types: ['user', 'lookup', 'sub_form'] },
  { title: '计算', types: ['formula', 'rollup'] },
];

/**
 * 安全获取字段类型元数据(兼容 noUncheckedIndexedAccess,提供兜底)。
 */
export function getFieldTypeMeta(type: FieldType | string): FieldTypeMeta {
  return (
    FIELD_TYPE_META[type as FieldType] ?? {
      label: type,
      icon: FontSizeOutlined,
      color: 'default',
      description: '',
    }
  );
}
