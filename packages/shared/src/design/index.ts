/**
 * 设计 token 层（2026-10-13「素蓝」定稿）——双前端共享的视觉世界 SSOT。
 *
 * 「素蓝」世界（用户 2026-10-13 定稿）：
 * - 全站唯一主色 #2563EB（品牌方块/主按钮/激活导航/链接/焦点），冷蓝灰墨阶；
 * - 白表面 + 发丝线分隔，无渐变无彩色光晕；画布 #F5F7FA；
 * - 应用瓷片统一蓝色字母标（弃 emoji 与多彩渐变）；
 * - Logo =「方孔 a」：蓝底白色单层 a，字腔为方块（字母承载名字，方块承载低代码）。
 *
 * 定位约束：不引入新设计语言，AntD v5 组件体系内做主题化；
 * 纯常量与纯函数，零运行时依赖（ANT_D_THEME 为可结构化赋给 ConfigProvider
 * theme 的普通对象，类型不做 antd 导入以保持 shared 零依赖）。
 */

// ============================================================================
// 品牌
// ============================================================================

export const BRAND = {
  /** 产品名（双端 wordmark：aPaaS Studio / aPaaS Runtime） */
  name: 'aPaaS',
  /** 主色（素蓝唯一蓝） */
  primary: '#2563EB',
  /** 主色悬停/深化 */
  primaryDeep: '#1D4ED8',
  /** 品牌辅色（深底提亮蓝/方点） */
  tint: '#7EA2F0',
  /** 登录页深蓝品牌底 */
  navy: '#16223B',
} as const;

/**
 * 「方孔 a」品牌图形 SVG（E 案，2026-10-13 用户选定）。
 * 蓝底圆角方 + 白色单层 a，字腔为方块——字母承载名字，方块承载低代码。
 * 手绘几何而非字体渲染，16px favicon 依然稳定。
 */
export function brandLogoMarkSvg(size = 28): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#2563EB"/><rect x="10" y="17" width="29" height="30" rx="8" fill="#FFF"/><rect x="20.5" y="27.5" width="13" height="13" rx="2.5" fill="#2563EB"/><rect x="43" y="17" width="11" height="30" rx="4.5" fill="#FFF"/></svg>`;
}

/** 单色描形变体（水印/单色版）：仅碗+竖笔，字腔透明。 */
export function brandLogoMonoSvg(size = 28, color = '#2563EB'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="10" y="17" width="29" height="30" rx="8" fill="${color}"/><rect x="43" y="17" width="11" height="30" rx="4.5" fill="${color}"/></svg>`;
}

/** 浅蓝变体（深色底使用，避免沉底）。 */
export function brandLogoMarkSvgLight(size = 28): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#5B8DEF"/><rect x="10" y="17" width="29" height="30" rx="8" fill="#FFF"/><rect x="20.5" y="27.5" width="13" height="13" rx="2.5" fill="#5B8DEF"/><rect x="43" y="17" width="11" height="30" rx="4.5" fill="#FFF"/></svg>`;
}

/** 应用默认主题色（瓷片统一素蓝，忽略 per-app 色——2026-10-13 定稿）。 */
export const DEFAULT_APP_COLOR = BRAND.primary;

/** 应用图标瓷片背景：统一实底素蓝（弃渐变/弃 emoji 多彩）。 */
export function appTileBackground(_color?: string | null): string {
  return DEFAULT_APP_COLOR;
}

/** 瓷片投影：素蓝世界无彩色光晕（craft floor：零偏移彩晕属装饰）。 */
export function appTileShadow(_color?: string | null): string {
  return 'none';
}

/** 应用瓷片（或任意媒体）内的字形颜色。 */
export const APP_TILE_FG = '#fff';

/** 工作台布局规范（双端壳层几何 SSOT）。 */
export const LAYOUT = {
  headerHeight: 60,
  /** studio 应用壳侧栏宽（素蓝：窄轨 168px，可收缩至 56） */
  siderWidth: 168,
  siderCollapsedWidth: 56,
  /** 内容区画布底色 */
  contentBg: '#F5F7FA',
  /** 侧栏底色（素蓝：白） */
  siderBg: '#FFFFFF',
  /** 壳层分隔线（发丝线） */
  borderColor: '#E9EEF5',
} as const;

// 登录页（融合版分屏）专属常量
export const LOGIN_BG = '#FAFBFD';
/** 左品牌栏底色（淡蓝灰） */
export const LOGIN_PANEL_BG = '#EEF3F9';
/** 品牌栏天光水印色（比底深半度） */
export const LOGIN_PANEL_WATERMARK = '#E2EAF5';
/** 品牌栏与表单区分隔线 */
export const LOGIN_PANEL_BORDER = '#E4EAF3';

/**
 * 应用状态 → Tag 色彩与中文标签（studio 应用列表 / runtime 卡片共用）。
 * 素蓝语义：已发布=蓝（在本平台即"生效色"），开发中=灰。
 */
export const APP_STATUS_META: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '开发中' },
  PUBLISHED: { color: 'blue', label: '已发布' },
  ARCHIVED: { color: 'default', label: '已归档' },
};

/**
 * 流程节点执行状态 → 色彩与中文标签。
 * studio ProcessTraceViewer 与 runtime TraceViewer 共用投影。
 */
export const TRACE_STATUS_META: Record<
  string,
  { color: string; bg: string; border: string; label: string; opacity: number }
> = {
  COMPLETED: { color: '#15803D', bg: '#ECFDF5', border: '#15803D', label: '已完成', opacity: 1 },
  RUNNING: {
    color: BRAND.primary,
    bg: '#EFF4FF',
    border: BRAND.primary,
    label: '执行中',
    opacity: 1,
  },
  WAITING: {
    color: '#D97706',
    bg: '#FFF7E6',
    border: '#D97706',
    label: '等待处理',
    opacity: 1,
  },
  SKIPPED: {
    color: '#CBD5E1',
    bg: '#F8FAFC',
    border: '#CBD5E1',
    label: '已跳过',
    opacity: 0.4,
  },
  PENDING: {
    color: '#CBD5E1',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    label: '未到达',
    opacity: 0.5,
  },
};

/**
 * 运行时页型 → 业务词与 Tag 色（AppView 门户卡片）。
 */
export const RUNTIME_PAGE_TYPE_META: Record<string, { label: string; color: string }> = {
  form_page: { label: '表单页', color: 'blue' },
  list_page: { label: '列表页', color: 'cyan' },
  detail_page: { label: '详情页', color: 'geekblue' },
  dashboard: { label: '仪表盘', color: 'purple' },
  custom: { label: '工作页', color: 'default' },
};

// ============================================================================
// 语义与中性 token（素蓝冷色阶）
//
// 两个前端 src 内禁止出现 hex 字面量——守卫 scripts/check-design-tokens.sh
// 零容忍（行内 `// design-token-allow` 可豁免并须写明理由）。
// 命名对齐 AntD token 词汇，ANT_D_THEME 直接由本表派生。
// ============================================================================

export const TOKENS = {
  // 品牌 / 语义
  colorPrimary: '#2563EB',
  colorPrimaryHover: '#1D4ED8',
  colorPrimaryBg: '#EFF4FF',
  colorPrimaryBorder: '#B6C7F5',
  colorInfo: '#2563EB',
  colorSuccess: '#15803D',
  colorSuccessBg: '#ECFDF5',
  colorWarning: '#D97706',
  colorWarningBg: '#FFF7E6',
  colorWarningDeep: '#B45309',
  colorGold: '#F59E0B',
  colorError: '#DC2626',
  colorErrorBg: '#FEF2F2',
  colorErrorDeep: '#B91C1C',
  // 文字（冷蓝灰墨阶）
  colorInk: '#1E293B',
  colorText: '#1E293B',
  colorTextSecondary: '#64748B',
  colorTextTertiary: '#94A3B8',
  colorTextQuaternary: '#B6C0CE',
  // 边框与分隔（发丝线体系）
  colorSplit: '#F1F5F9',
  colorBorder: '#DBE2EC',
  /** 状态点-未激活（开发中/草稿灰点） */
  colorDotIdle: '#CBD5E1',
  colorBorderSecondary: '#E9EEF5',
  colorFillTertiary: '#F1F5F9',
  colorFillQuaternary: '#F8FAFC',
  // 画布（flowgram 连线基色/激活色）
  colorLineBase: '#C4CDD9',
  colorLineActive: '#7E9CE8',
  // 背景与面
  colorBgLayout: '#F5F7FA',
  colorBgContainer: '#FFFFFF',
  colorBgSider: '#FFFFFF',
  colorNavy: '#16223B',
  colorNavyTint: '#8FA8DC',
  colorWhite: '#FFFFFF',
} as const;

/**
 * AntD / AntV 预设色基元——仅供"数据性用色"（流程节点分类、图表色板等），
 * 禁止在业务代码里散落字面量。
 */
export const PRESET = {
  purple6: '#7C3AED',
  purple5: '#8B5CF6',
  purple4: '#A78BFA',
  cyan6: '#0891B2',
  cyan5: '#06B6D4',
  magenta6: '#DB2777',
  geekblue6: '#4338CA',
  gold4: '#FACC15',
  red4: '#F87171',
  blue4: '#60A5FA',
  daybreakBlue: '#5B8FF9',
  mint: '#5AD8A6',
} as const;

// ============================================================================
// AntD ConfigProvider 主题（上轮遗留步骤 4，本轮落地）
//
// 结构兼容 AntD ThemeConfig 的 token 子集——消费方直接
// `<ConfigProvider theme={ANT_D_THEME}>`；类型用本地接口而非 import antd，
// 保持 shared 零运行时/零对等依赖。
// ============================================================================

/** AntD SeedToken/MapToken 子集的结构类型（与 antd ThemeConfig['token'] 结构兼容）。 */
export interface AntDThemeTokenShape {
  colorPrimary: string;
  colorInfo: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorTextQuaternary: string;
  colorBgLayout: string;
  colorBgContainer: string;
  colorBorder: string;
  colorBorderSecondary: string;
  colorSplit: string;
  colorLink: string;
  borderRadius: number;
  controlHeight: number;
  fontSize: number;
  fontFamily: string;
  wireframe: boolean;
}

/** 双端统一 AntD 主题——从素蓝 TOKENS 派生，禁止在消费端另写 token。 */
export const ANT_D_THEME: { token: AntDThemeTokenShape } = {
  token: {
    colorPrimary: TOKENS.colorPrimary,
    colorInfo: TOKENS.colorInfo,
    colorSuccess: TOKENS.colorSuccess,
    colorWarning: TOKENS.colorWarning,
    colorError: TOKENS.colorError,
    colorText: TOKENS.colorText,
    colorTextSecondary: TOKENS.colorTextSecondary,
    colorTextTertiary: TOKENS.colorTextTertiary,
    colorTextQuaternary: TOKENS.colorTextQuaternary,
    colorBgLayout: TOKENS.colorBgLayout,
    colorBgContainer: TOKENS.colorBgContainer,
    colorBorder: TOKENS.colorBorder,
    colorBorderSecondary: TOKENS.colorBorderSecondary,
    colorSplit: TOKENS.colorSplit,
    colorLink: TOKENS.colorPrimary,
    borderRadius: 9,
    controlHeight: 36,
    fontSize: 14,
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif",
    wireframe: false,
  },
};
