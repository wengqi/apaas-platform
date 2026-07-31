import {
  LayoutOutlined,
  BlockOutlined,
  AppstoreOutlined,
  TableOutlined,
  ColumnHeightOutlined,
  ProfileOutlined,
  UnorderedListOutlined,
  FormOutlined,
  FontSizeOutlined,
  AlignLeftOutlined,
  NumberOutlined,
  CaretDownOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  SwapOutlined,
  LinkOutlined,
  UploadOutlined,
  UserOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  FileMarkdownOutlined,
  LineOutlined,
  FontColorsOutlined,
} from '@ant-design/icons';
import type { ComponentType } from '../api/pages.js';

/** AntD 图标组件类型(所有 @ant-design/icons 共享同一类型)。 */
type IconType = typeof LayoutOutlined;

/** 组件分类。 */
export type ComponentCategory = 'container' | 'data' | 'form' | 'display';

/** 组件元数据。 */
export interface ComponentMeta {
  /** 中文显示名 */
  label: string;
  /** 图标组件 */
  icon: IconType;
  /** 分类 */
  category: ComponentCategory;
  /** 是否可容纳子组件 */
  isContainer: boolean;
  /** 简短描述 */
  description: string;
  /** 拖入时的初始 props */
  defaultProps: Record<string, unknown>;
}

/**
 * 组件类型元数据表 —— 单一数据源,驱动组件面板、画布渲染、属性面板。
 * 图标全部来自 @ant-design/icons(已验证可用)。
 * 对齐 packages/shared/src/page/index.ts 的 ComponentType 枚举。
 */
export const COMPONENT_META: Record<ComponentType, ComponentMeta> = {
  // —— 容器类 ——
  page: {
    label: '页面',
    icon: LayoutOutlined,
    category: 'container',
    isContainer: true,
    description: '页面根容器',
    defaultProps: {},
  },
  section: {
    label: '分区',
    icon: BlockOutlined,
    category: 'container',
    isContainer: true,
    description: '页面分区,用于组织布局',
    defaultProps: { title: '分区' },
  },
  tabs: {
    label: '标签页',
    icon: AppstoreOutlined,
    category: 'container',
    isContainer: true,
    description: '多标签页容器',
    defaultProps: {},
  },
  grid: {
    label: '栅格',
    icon: TableOutlined,
    category: 'container',
    isContainer: true,
    description: '栅格布局容器',
    defaultProps: { columns: 2 },
  },
  grid_column: {
    label: '栅格列',
    icon: ColumnHeightOutlined,
    category: 'container',
    isContainer: true,
    description: '栅格列(栅格子项)',
    defaultProps: {},
  },

  // —— 数据类 ——
  data_table: {
    label: '数据表格',
    icon: TableOutlined,
    category: 'data',
    isContainer: false,
    description: '展示记录列表,支持分页/排序/筛选',
    defaultProps: { title: '数据表格' },
  },
  detail_card: {
    label: '详情卡片',
    icon: ProfileOutlined,
    category: 'data',
    isContainer: false,
    description: '展示单条记录详情',
    defaultProps: { title: '详情卡片' },
  },
  list: {
    label: '列表',
    icon: UnorderedListOutlined,
    category: 'data',
    isContainer: false,
    description: '列表形式展示数据',
    defaultProps: {},
  },

  // —— 表单类 ——
  form: {
    label: '表单',
    icon: FormOutlined,
    category: 'form',
    isContainer: true,
    description: '表单容器,提交/取消按钮',
    defaultProps: { title: '表单' },
  },
  text_input: {
    label: '单行文本',
    icon: FontSizeOutlined,
    category: 'form',
    isContainer: false,
    description: '单行文本输入框',
    defaultProps: { placeholder: '请输入' },
  },
  textarea: {
    label: '多行文本',
    icon: AlignLeftOutlined,
    category: 'form',
    isContainer: false,
    description: '多行文本输入框',
    defaultProps: { placeholder: '请输入' },
  },
  number_input: {
    label: '数字',
    icon: NumberOutlined,
    category: 'form',
    isContainer: false,
    description: '数字输入框',
    defaultProps: { placeholder: '请输入数字' },
  },
  select: {
    label: '下拉选择',
    icon: CaretDownOutlined,
    category: 'form',
    isContainer: false,
    description: '下拉单选',
    defaultProps: { placeholder: '请选择' },
  },
  multi_select: {
    label: '多选下拉',
    icon: CaretDownOutlined,
    category: 'form',
    isContainer: false,
    description: '下拉多选',
    defaultProps: { placeholder: '请选择' },
  },
  date_picker: {
    label: '日期',
    icon: CalendarOutlined,
    category: 'form',
    isContainer: false,
    description: '日期选择器',
    defaultProps: { placeholder: '请选择日期' },
  },
  radio: {
    label: '单选',
    icon: CheckCircleOutlined,
    category: 'form',
    isContainer: false,
    description: '单选按钮组',
    defaultProps: {},
  },
  checkbox: {
    label: '复选框',
    icon: CheckSquareOutlined,
    category: 'form',
    isContainer: false,
    description: '复选框',
    defaultProps: {},
  },
  switch: {
    label: '开关',
    icon: SwapOutlined,
    category: 'form',
    isContainer: false,
    description: '开关切换',
    defaultProps: {},
  },
  lookup_picker: {
    label: '关联选择器',
    icon: LinkOutlined,
    category: 'form',
    isContainer: false,
    description: '关联其他对象记录',
    defaultProps: { placeholder: '请选择' },
  },
  sub_form_table: {
    label: '子表表格',
    icon: TableOutlined,
    category: 'form',
    isContainer: false,
    description: '一对多子表记录',
    defaultProps: {},
  },
  attachment_upload: {
    label: '附件上传',
    icon: UploadOutlined,
    category: 'form',
    isContainer: false,
    description: '文件附件上传',
    defaultProps: {},
  },
  user_picker: {
    label: '人员选择',
    icon: UserOutlined,
    category: 'form',
    isContainer: false,
    description: '关联系统用户',
    defaultProps: { placeholder: '请选择人员' },
  },

  // —— 展示类 ——
  button: {
    label: '按钮',
    icon: ThunderboltOutlined,
    category: 'display',
    isContainer: false,
    description: '可配置点击事件的按钮',
    defaultProps: { text: '按钮' },
  },
  statistic: {
    label: '统计数字',
    icon: NumberOutlined,
    category: 'display',
    isContainer: false,
    description: '统计数字展示',
    defaultProps: { title: '统计', value: 0 },
  },
  chart: {
    label: '图表',
    icon: BarChartOutlined,
    category: 'display',
    isContainer: false,
    description: '数据可视化图表',
    defaultProps: {},
  },
  rich_text_display: {
    label: '富文本展示',
    icon: FileMarkdownOutlined,
    category: 'display',
    isContainer: false,
    description: '富文本内容展示',
    defaultProps: { content: '富文本内容' },
  },
  divider: {
    label: '分割线',
    icon: LineOutlined,
    category: 'display',
    isContainer: false,
    description: '内容分割线',
    defaultProps: {},
  },
  text: {
    label: '文本',
    icon: FontColorsOutlined,
    category: 'display',
    isContainer: false,
    description: '纯文本展示',
    defaultProps: { content: '文本内容' },
  },
};

/** 组件分类分组(用于组件面板折叠面板)。grid_column 不在面板展示(由栅格自动管理)。 */
export const COMPONENT_GROUPS: {
  title: string;
  category: ComponentCategory;
  types: ComponentType[];
}[] = [
  { title: '容器', category: 'container', types: ['page', 'section', 'tabs', 'grid'] },
  { title: '数据', category: 'data', types: ['data_table', 'detail_card', 'list'] },
  {
    title: '表单',
    category: 'form',
    types: [
      'form',
      'text_input',
      'textarea',
      'number_input',
      'select',
      'multi_select',
      'date_picker',
      'radio',
      'checkbox',
      'switch',
      'lookup_picker',
      'sub_form_table',
      'attachment_upload',
      'user_picker',
    ],
  },
  {
    title: '展示',
    category: 'display',
    types: ['button', 'statistic', 'chart', 'rich_text_display', 'divider', 'text'],
  },
];

/** 组件支持的事件(按组件类型预定义)。 */
export const COMPONENT_EVENTS: Partial<Record<ComponentType, string[]>> = {
  button: ['onClick'],
  form: ['onSubmit', 'onReset'],
  text_input: ['onChange'],
  textarea: ['onChange'],
  number_input: ['onChange'],
  select: ['onChange'],
  multi_select: ['onChange'],
  date_picker: ['onChange'],
  switch: ['onChange'],
  data_table: ['onRowClick', 'onRowDoubleClick'],
  page: ['onLoad'],
};

/** 动作类型元数据。 */
export const ACTION_TYPE_META: Record<string, { label: string; description: string }> = {
  query_records: { label: '查询记录', description: '查询对象记录并填充到变量' },
  create_record: { label: '新增记录', description: '创建一条新记录' },
  update_record: { label: '更新记录', description: '更新一条记录' },
  delete_record: { label: '删除记录', description: '删除一条记录' },
  navigate: { label: '页面跳转', description: '跳转到指定页面或 URL' },
  open_modal: { label: '打开弹窗', description: '打开一个弹窗' },
  close_modal: { label: '关闭弹窗', description: '关闭当前弹窗' },
  confirm: { label: '弹出确认框', description: '弹出确认对话框' },
  toast: { label: '弹出提示', description: '显示一条提示消息' },
  call_api: { label: '调用 API', description: '调用自定义 API' },
  trigger_process: { label: '触发流程', description: '触发一个流程' },
  set_variable: { label: '设置变量', description: '设置视图模型变量的值' },
};

/** 页面类型选项。 */
export const PAGE_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '列表页', value: 'list_page' },
  { label: '详情页', value: 'detail_page' },
  { label: '表单页', value: 'form_page' },
  { label: '仪表盘', value: 'dashboard' },
  { label: '自定义', value: 'custom' },
];

/**
 * 安全获取组件元数据(兼容 noUncheckedIndexedAccess,提供兜底)。
 */
export function getComponentMeta(type: ComponentType | string): ComponentMeta {
  const meta = COMPONENT_META[type as ComponentType];
  if (meta) return meta;
  return {
    label: type,
    icon: AppstoreOutlined,
    category: 'display',
    isContainer: false,
    description: '',
    defaultProps: {},
  };
}
