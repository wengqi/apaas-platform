/**
 * 设计 token 层（2026-10-12 评审 P1）——双前端共享的视觉世界 SSOT。
 *
 * 背景：critique 评审判定 studio 与 runtime-ui "像两家公司的两个产品"
 * （登录页/头部色彩/图标语言三重分裂，一致性问题Nielsen 1/4）。
 * 本模块把品牌、应用图标瓷片、布局规范、状态色彩收敛为单一事实源，
 * 两个前端一律从此消费，禁止再写本地副本。
 *
 * 定位约束（ADR-0003 后的 AntD 原味路线）：不引入新设计语言，只把
 * 已存在且被多处复制的值 token 化；纯常量与纯函数，零运行时依赖。
 */

/** 品牌基元。 */
export const BRAND = {
  /** 产品主色（与 AntD 默认主色一致，AntD 原味路线不另立品牌色） */
  primary: '#1677ff',
  /** 产品图形符号（登录页/加载占位共用；运行时业务头不展示品牌区） */
  logoGlyph: '⚡',
  logoGradient: 'linear-gradient(135deg, #1677ff, #4096ff)',
  logoShadow: '0 8px 20px rgba(22,119,255,0.3)',
} as const;

/** 应用默认主题色（应用未选色时的瓷片底色）。 */
export const DEFAULT_APP_COLOR = BRAND.primary;

/**
 * 应用图标瓷片背景（AppCard / StudioLayout 顶栏 / AppDashboard / 运行时
 * Home 与 AppView 共用的"渐变瓷片"语言）。
 */
export function appTileBackground(color?: string | null): string {
  const c = color || DEFAULT_APP_COLOR;
  return `linear-gradient(135deg, ${c}, ${c}dd)`;
}

/** 应用图标瓷片投影（与背景同色系，随应用主题色变化）。 */
export function appTileShadow(color?: string | null): string {
  return `0 4px 12px ${color || DEFAULT_APP_COLOR}40`;
}

/** 应用瓷片（或任意媒体）内的字形颜色。 */
export const APP_TILE_FG = '#fff';

/** 工作台布局规范（StudioLayout 定义的壳层几何，runtime 头部对齐同一套）。 */
export const LAYOUT = {
  headerHeight: 56,
  /** 内容区画布底色 */
  contentBg: '#f5f7fa',
  /** 侧栏底色 */
  siderBg: '#f7f9fc',
  /** 壳层分隔线 */
  borderColor: '#eef0f4',
} as const;

/** 登录页共用背景（两端同一世界；替换 studio 教程紫渐变 #667eea→#764ba2）。 */
export const LOGIN_BG = 'linear-gradient(180deg, #f5f7fa 0%, #e6f4ff 100%)';

/**
 * 应用状态 → Tag 色彩与中文标签（studio 应用列表 / runtime 卡片共用）。
 * color 值为 AntD Tag 预设色名。
 */
export const APP_STATUS_META: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '开发中' },
  PUBLISHED: { color: 'green', label: '已发布' },
  ARCHIVED: { color: 'red', label: '已归档' },
};

/**
 * 流程节点执行状态 → 色彩与中文标签。
 * studio ProcessTraceViewer 与 runtime TraceViewer 此前双端复制
 * （评审发现的系统性漂移点）；图标两端各自本地渲染，本表只承载色彩语义。
 */
export const TRACE_STATUS_META: Record<
  string,
  { color: string; bg: string; border: string; label: string; opacity: number }
> = {
  COMPLETED: { color: '#52c41a', bg: '#f6ffed', border: '#52c41a', label: '已完成', opacity: 1 },
  RUNNING: {
    color: BRAND.primary,
    bg: '#e6f4ff',
    border: BRAND.primary,
    label: '执行中',
    opacity: 1,
  },
  WAITING: {
    color: '#fa8c16',
    bg: '#fff7e6',
    border: '#fa8c16',
    label: '等待处理',
    opacity: 1,
  },
  SKIPPED: {
    color: '#d9d9d9',
    bg: '#fafafa',
    border: '#d9d9d9',
    label: '已跳过',
    opacity: 0.4,
  },
  PENDING: {
    color: '#d9d9d9',
    bg: '#fafafa',
    border: '#e4e7ed',
    label: '未到达',
    opacity: 0.5,
  },
};

/**
 * 运行时页型 → 业务词与 Tag 色（AppView 门户卡片）。
 * 评审 P0：工程词"自定义"对业务用户无意义，定为"工作页"。
 */
export const RUNTIME_PAGE_TYPE_META: Record<string, { label: string; color: string }> = {
  form_page: { label: '表单页', color: 'blue' },
  list_page: { label: '列表页', color: 'cyan' },
  detail_page: { label: '详情页', color: 'geekblue' },
  dashboard: { label: '仪表盘', color: 'purple' },
  custom: { label: '工作页', color: 'default' },
};

// ============================================================================
// 语义与中性 token（2026-10-12 token 化轮：审计遗留"250+ 硬编码色值"销账）
//
// 命名对齐 AntD token 词汇（为将来 ConfigProvider theme 集成预留同名映射）。
// 两个前端 src 内禁止再出现 hex 字面量——守卫 scripts/check-design-tokens.sh
// 零容忍（行内 `// design-token-allow` 可豁免并须写明理由）。
// 近似值归一化说明：#e5e7eb/#ebedf0/#e8eaed 等发丝线并入 colorBorderSecondary，
// #fafbfc/#f6f8fa/#fafafa/#f5f5f5 并入 colorFillQuaternary，#999 并入
// colorTextTertiary，#f0f5ff 并入 colorPrimaryBg——灰阶从 9 档收敛到 5 档。
// ============================================================================

/** 语义与中性色（AntD token 同名词汇）。 */
export const TOKENS = {
  // 品牌 / 语义
  colorPrimary: '#1677ff',
  colorInfo: '#1677ff',
  colorPrimaryBg: '#e6f4ff', // 主色底（吸收 geekblue-1 #f0f5ff）
  colorPrimaryBorder: '#91caff',
  colorSuccess: '#52c41a',
  colorSuccessBg: '#f6ffed',
  colorWarning: '#fa8c16', // 项目语义：等待/对象操作橙（AntD 默认 warning 为 gold，见 colorGold）
  colorWarningBg: '#fff7e6',
  colorGold: '#faad14',
  colorError: '#ff4d4f',
  colorErrorBg: '#fff1f0', // danger 浅底（red-1）
  colorErrorDeep: '#cf1322', // 统计数字等强 danger 文字（red-7）
  // 文字
  colorInk: '#1a1a1a', // 画布节点标题等深墨字
  colorTextTertiary: '#8c8c8c', // 三级说明文字（吸收 #999）
  colorTextQuaternary: '#bfbfbf', // 四级/装饰（禁用、箭头、placeholder 前缀）
  // 边框与分隔
  colorSplit: '#f0f0f0', // 分隔线（吸收 #f0f2f5）
  colorBorder: '#d9d9d9',
  colorBorderSecondary: '#eef0f4', // 发丝线（吸收 #e5e7eb/#ebedf0/#e8eaed）
  colorFillTertiary: '#eff1f3',
  colorFillQuaternary: '#fafbfc', // 浅底（吸收 #f6f8fa/#fafafa/#f5f5f5）
  // 画布（flowgram 连线基色/激活色）
  colorLineBase: '#b8bcc1',
  colorLineActive: '#82a7fc',
  // 背景与面
  colorBgLayout: '#f5f7fa',
  colorBgSider: '#f7f9fc',
  colorWhite: '#ffffff',
} as const;

/**
 * AntD / AntV 预设色基元——供"数据性用色"的色板引用（流程节点分类、
 * 数据流节点、字段颜色选项等），禁止在业务代码里散落字面量。
 */
export const PRESET = {
  purple6: '#722ed1',
  purple5: '#9254de',
  purple4: '#b37feb',
  cyan6: '#13c2c2',
  cyan5: '#36cfc9',
  magenta6: '#eb2f96',
  geekblue6: '#2f54eb',
  gold4: '#fadb14',
  red4: '#ff7875',
  blue4: '#69c0ff',
  daybreakBlue: '#5b8ff9', // AntV 图表色板
  mint: '#5ad8a6', // AntV 图表色板
} as const;
