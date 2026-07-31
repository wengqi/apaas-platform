/**
 * 应用 (Application) 类型契约 —— 低代码平台的顶层业务容器。
 *
 * 对标飞书 aPaaS：租户下创建多个应用，应用是对象/页面/流程/权限等资源的归属容器。
 * 应用具备开发态(搭建)与运行态(发布)的环境隔离。
 *
 * 层级关系：租户(Tenant) → 应用(Application) → 对象/页面/流程/权限
 *
 * @see docs/architecture/ARCHITECTURE.md
 */

import type { AppId, ISODateString, TenantId, UserId } from '../common/index.js';

/** 应用状态。 */
export enum AppStatus {
  /** 开发中 */
  Draft = 'DRAFT',
  /** 已发布 */
  Published = 'PUBLISHED',
  /** 已归档 */
  Archived = 'ARCHIVED',
}

/** 应用环境。对标飞书 aPaaS 的开发态/运行态隔离。 */
export enum AppEnv {
  /** 开发环境（搭建器编辑） */
  Dev = 'dev',
  /** 线上环境（运行时发布版） */
  Prod = 'prod',
}

/**
 * 应用定义 —— 平台的顶层业务容器。
 * 一个应用包含对象、页面、流程、权限、连接器等资源。
 */
export interface Application {
  id: AppId;
  tenantId: TenantId;
  /** API 名称（小写下划线，租户内唯一，如 'asset_management'） */
  apiName: string;
  /** 显示名称 */
  name: string;
  /** 应用描述 */
  description?: string;
  /** 应用图标标识 */
  icon?: string;
  /** 应用主题色 */
  color?: string;
  /** 应用状态 */
  status: AppStatus;
  /** 当前发布版本号（每次发布递增） */
  version: number;
  /** 已发布的应用快照 JSON（含对象/页面/流程定义的完整副本） */
  publishedSnapshot?: Record<string, unknown>;
  /** 最后发布时间 */
  publishedAt?: ISODateString;
  /** 创建者 */
  createdBy: UserId;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 创建应用请求。 */
export interface CreateAppRequest {
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

/** 更新应用请求。 */
export interface UpdateAppRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

/** 应用概要（列表页用，不含快照等重字段）。 */
export interface AppSummary {
  id: AppId;
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  status: AppStatus;
  version: number;
  /** 应用内资源统计 */
  stats: {
    objects: number;
    pages: number;
    processes: number;
  };
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 发布应用请求。 */
export interface PublishAppRequest {
  /** 发布说明 */
  notes?: string;
}
