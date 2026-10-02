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
  /** 最后发布时间 */
  publishedAt?: ISODateString;
  /** 创建者 */
  createdBy: UserId;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 创建应用请求。 */
export interface CreateAppRequest {
  /** API 名称（可选，不传则后端自动生成 package_xxxxxx 格式） */
  apiName?: string;
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
  /** 语义化版本号，如 "0.1.0" */
  version: string;
  /** 更新说明（必填） */
  description: string;
}

// ============================================================================
// 发布版本管理
// ============================================================================

/** 应用版本状态（字符串联合类型，避免与 Prisma 生成的枚举冲突） */
export type AppVersionStatus = 'PUBLISHED' | 'ROLLED_BACK';

/** 应用版本记录 */
export interface AppVersion {
  id: string;
  appId: AppId;
  versionNumber: string;
  description: string;
  snapshot: AppSnapshot;
  changeSet: ChangeSet | null;
  status: AppVersionStatus;
  publishedBy: UserId;
  publishedAt: ISODateString;
}

/** 应用版本概要（列表用，不含快照等重字段） */
export interface AppVersionSummary {
  id: string;
  appId: AppId;
  versionNumber: string;
  description: string;
  status: AppVersionStatus;
  publishedBy: UserId;
  publishedAt: ISODateString;
}

// ============================================================================
// 应用配置快照 — 发布时生成的完整配置 JSON
// ============================================================================

export interface AppSnapshot {
  meta: {
    appId: AppId;
    appName: string;
    apiName: string;
    version: string;
    publishedAt: ISODateString;
    publishedBy: UserId;
  };
  objects: Array<{
    id: string;
    apiName: string;
    name: string;
    description: string | null;
    icon: string | null;
    fields: unknown[];
    isSystem: boolean;
    views: Array<{
      id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
    }>;
  }>;
  pages: Array<{
    id: string;
    apiName: string;
    name: string;
    type: string;
    schema: Record<string, unknown>;
    objectId: string | null;
  }>;
  processes: Array<{
    id: string;
    apiName: string;
    name: string;
    workflowSchema: Record<string, unknown>;
    triggerType: string | null;
    /** R1.4：SCHEDULED 触发器随环境重建需要 cron（旧快照缺失时触发器回退活表读取） */
    cron?: string | null;
  }>;
  permissions: {
    roles: Array<{
      id: string;
      name: string;
      code: string;
      isBuiltIn: boolean;
      rules: Array<{
        id: string;
        type: string;
        action: string;
        targetId: string | null;
        conditions: Record<string, unknown> | null;
        fieldScope: string[] | null;
      }>;
    }>;
  };
}

// ============================================================================
// 预检
// ============================================================================

/** 预检结果 */
export interface CheckResult {
  status: 'PASS' | 'FAIL';
  issues: Array<{
    level: 'ERROR' | 'WARNING' | 'INFO';
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION';
    entityId: string;
    entityName: string;
    message: string;
    suggestion: string | null;
  }>;
  checkedAt: ISODateString;
  checkedBy: UserId;
}

/** 预检记录（持久化） */
export interface AppCheckRecord {
  id: string;
  appId: AppId;
  result: 'PASS' | 'FAIL';
  issues: CheckResult['issues'] | null;
  checkedBy: UserId;
  checkedAt: ISODateString;
}

// ============================================================================
// 变更追踪
// ============================================================================

/** 变更清单 — 发布时对比当前开发态与上次发布快照生成 */
export interface ChangeSet {
  modules: Array<{
    module: 'PAGE' | 'OBJECT' | 'PROCESS' | 'PERMISSION';
    changes: Array<{
      entityId: string;
      entityName: string;
      changeType: 'CREATE' | 'UPDATE' | 'DELETE';
      changedBy: string;
      changedAt: string;
      description: string;
    }>;
  }>;
  baselineVersion: string | null;
}

/** 变更追踪记录 */
export interface ChangeLogEntry {
  id: string;
  appId: AppId;
  module: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  changedBy: UserId;
  changeDescription: string | null;
  changedAt: ISODateString;
}
