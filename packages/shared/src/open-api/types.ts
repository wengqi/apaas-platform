/**
 * 开放 API 域共享类型（G6 纯流程 API 产品化）。
 *
 * 服务身份（入站 API Key）+ 流程 API 版本发布（major 绑定冻结快照）+
 * 开放触发端点的请求/响应契约。
 */

import type { ResourceDiff } from '../review/index.js';

/** 服务身份状态 */
export type ServiceIdentityStatus = 'ACTIVE' | 'REVOKED';

/** 服务身份 DTO（不含 keyHash；明文 key 仅创建响应一次性返回） */
export interface ServiceIdentityDto {
  id: string;
  tenantId: string;
  appId: string | null;
  name: string;
  /** 展示用前缀（完整 key 前 12 位，如 ak_3f9a2b1c8d） */
  keyPrefix: string;
  status: ServiceIdentityStatus;
  lastUsedAt: string | null;
  createdBy: string;
  createdAt: string;
}

/** 创建响应：明文 key 一次性返回 */
export interface ServiceIdentityCreatedDto extends ServiceIdentityDto {
  /** 完整 API Key（仅此一次可见） */
  apiKey: string;
}

/** 流程 API 版本发布状态 */
export type ProcessApiReleaseStatus = 'ACTIVE' | 'DEPRECATED';

/** 版本发布 DTO */
export interface ProcessApiReleaseDto {
  id: string;
  appId: string;
  processDefId: string;
  apiName: string;
  majorVersion: number;
  status: ProcessApiReleaseStatus;
  triggerType: string;
  releasedBy: string;
  createdAt: string;
}

/** 版本发布结果（含与上一 major 的结构化 diff，破坏性变更半自动） */
export interface ProcessApiReleaseCreatedDto extends ProcessApiReleaseDto {
  /** 与上一 major 冻结快照的 diff；首发为 null */
  diff: ResourceDiff | null;
  /** 本次发布后将旧 major 置为 DEPRECATED 的版本号列表 */
  deprecatedMajors: number[];
}

/** 开放触发结果（外部系统消费的契约） */
export interface OpenApiStartResult {
  instanceId: string;
  processApiName: string;
  /** 实际执行的 major（未钉版本 = 最新 ACTIVE） */
  majorVersion: number;
  status: string;
}

/** 可调用流程发现条目 */
export interface OpenApiProcessDto {
  apiName: string;
  name: string;
  latestMajor: number | null;
  triggerUrl: string;
}
