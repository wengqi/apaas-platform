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
export enum PageType {
  ListPage = 'list_page',
  DetailPage = 'detail_page',
  FormPage = 'form_page',
  Dashboard = 'dashboard',
  Custom = 'custom',
}
/**
 * 页面 Schema —— 搭建器的核心产出。
 * 运行时渲染器读取此 Schema 动态渲染页面。
 */
/**
 * 页面 Schema —— amis 方言（唯一方言，ADR-0003）。
 *
 * 形状约束在 G3 amis_page 校验合同（服务端硬闸），类型层保持宽松。
 */
export type PageSchema = Record<string, unknown>;

/** 页面元数据（存储于 pages 表）。 */
/**
 * 页面保存点信息（E2-4 飞书式历史）。
 * 列表接口不含 schema 全量（体积大），恢复时经 restore 接口取回。
 */
export interface PageSavePointInfo {
  id: string;
  pageId: PageId;
  /** save = 保存自动捕获；restore = 历史恢复回滚点 */
  source: 'save' | 'restore';
  createdBy: string;
  createdAt: ISODateString;
}

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

// ---------------------------------------------------------------------------
// 图表组件配置（飞书对齐：柱状图/折线图/饼图/漏斗图）
// ---------------------------------------------------------------------------

/** 图表类型。 */
export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'funnel'
  // —— 页面模块对齐批次C4 扩展 ——
  | 'area'
  | 'scatter'
  | 'bar_horizontal'
  | 'radar'
  | 'waterfall'
  | 'wordcloud'
  | 'combo';

/** 聚合方式。 */
export type ChartAggregation = 'sum' | 'count' | 'avg' | 'max' | 'min';

/** 时间分桶粒度（趋势图用）。 */
export type TimeGranularity = 'day' | 'week' | 'month';

/** 图表组件配置。 */
export interface ChartConfig {
  /** 图表类型 */
  chartType: ChartType;
  /** 图表标题 */
  title?: string;
  /** 分类字段（X 轴 / 饼图标签），省略时返回标量聚合值（指标卡用） */
  categoryField?: string;
  /** 值字段（Y 轴 / 饼图值），count 聚合时可省略 */
  valueField?: string;
  /** 聚合方式 */
  aggregation?: ChartAggregation;
  /** 时间分桶粒度（当 categoryField 为日期字段时使用） */
  timeGranularity?: TimeGranularity;
}

/** 图表聚合数据点。 */
export interface ChartDataPoint {
  /** 分类标签 */
  category: string;
  /** 聚合值 */
  value: number;
}

/** 图表聚合结果（后端 ChartDataService 返回）。 */
export interface ChartDataResult {
  /** 聚合后的数据点数组 */
  data: ChartDataPoint[];
  /** 分类标签列表 */
  categories: string[];
  /** 数值列表 */
  values: number[];
  /** 源数据总行数 */
  totalRecords: number;
}

// ---------------------------------------------------------------------------
// 仪表盘网格布局（react-grid-layout 坐标模型）
// ---------------------------------------------------------------------------

/** 网格布局项（单个 widget 在网格中的位置和尺寸）。 */
export interface LayoutItem {
  /** 关联的子节点 ID（与 ComponentNode.id 对应） */
  i: string;
  /** X 坐标（列偏移，0-based） */
  x: number;
  /** Y 坐标（行偏移，0-based） */
  y: number;
  /** 宽度（列数，cols 总数由 DashboardGrid props.cols 决定，默认 12） */
  w: number;
  /** 高度（行数，单行高度由 props.rowHeight 决定，默认 30px） */
  h: number;
}

// ---------------------------------------------------------------------------
