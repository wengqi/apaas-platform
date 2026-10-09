/**
 * 审核中心 API 封装（R1.2）。
 *
 * 后端端点:
 *   GET  /api/apps/:appId/reviews             — 提交单列表
 *   GET  /api/apps/:appId/reviews/dirty       — 未提交变更清单
 *   GET  /api/apps/:appId/reviews/versions    — 资源版本链
 *   GET  /api/apps/:appId/reviews/:id         — 提交单详情（含 diff）
 *   POST /api/apps/:appId/reviews/submit      — 人工提交基线
 *   POST /api/apps/:appId/reviews/discard     — 撤销未提交
 *   POST /api/apps/:appId/reviews/:id/approve — 批准
 *   POST /api/apps/:appId/reviews/:id/reject  — 驳回
 *   POST /api/apps/:appId/reviews/:id/adopt   — 改稿收编（ADR-0004 决策 4）
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type {
  DirtyResourceDto,
  ResourceSnapshot,
  ResourceVersionDetailDto,
  ResourceVersionDto,
  ResourceVersionListItemDto,
  ReviewModule,
} from '@apaas/shared';

export interface ReviewListParams {
  status?: string;
  module?: string;
}

export const reviewsApi = {
  /** 提交单列表 */
  list: (appId: string, params?: ReviewListParams) =>
    client
      .get<ApiResponse<ResourceVersionListItemDto[]>>(`/api/apps/${appId}/reviews`, { params })
      .then((res) => res.data.data as ResourceVersionListItemDto[]),

  /** 提交单详情（含快照与完整 diff） */
  get: (appId: string, submissionId: string) =>
    client
      .get<ApiResponse<ResourceVersionDetailDto>>(`/api/apps/${appId}/reviews/${submissionId}`)
      .then((res) => res.data.data as ResourceVersionDetailDto),

  /** 未提交变更清单 */
  dirty: (appId: string) =>
    client
      .get<ApiResponse<DirtyResourceDto[]>>(`/api/apps/${appId}/reviews/dirty`)
      .then((res) => res.data.data as DirtyResourceDto[]),

  /** 资源版本链 */
  versions: (appId: string, module: ReviewModule, entityId: string) =>
    client
      .get<ApiResponse<ResourceVersionDto[]>>(`/api/apps/${appId}/reviews/versions`, {
        params: { module, entityId },
      })
      .then((res) => res.data.data as ResourceVersionDto[]),

  /** 人工提交基线 */
  submit: (appId: string, params: { module: ReviewModule; entityId: string }) =>
    client
      .post<ApiResponse<ResourceVersionDto>>(`/api/apps/${appId}/reviews/submit`, params)
      .then((res) => res.data.data as ResourceVersionDto),

  /** 撤销未提交 */
  discard: (appId: string, params: { module: ReviewModule; entityId: string }) =>
    client
      .post<ApiResponse<{ reverted: boolean; apiName: string }>>(
        `/api/apps/${appId}/reviews/discard`,
        params,
      )
      .then((res) => res.data.data as { reverted: boolean; apiName: string }),

  /** 批准（活表漂移时可 force） */
  approve: (appId: string, submissionId: string, params?: { comment?: string; force?: boolean }) =>
    client
      .post<ApiResponse<ResourceVersionDto>>(
        `/api/apps/${appId}/reviews/${submissionId}/approve`,
        params ?? {},
      )
      .then((res) => res.data.data as ResourceVersionDto),

  /** 驳回（意见必填） */
  reject: (appId: string, submissionId: string, comment: string) =>
    client
      .post<ApiResponse<ResourceVersionDto>>(`/api/apps/${appId}/reviews/${submissionId}/reject`, {
        comment,
      })
      .then((res) => res.data.data as ResourceVersionDto),

  /** 批量批准：对象→页面→流程拓扑序落地并解析 @ref: 引用令牌 */
  approveBatch: (appId: string, batchId: string, params?: { comment?: string; force?: boolean }) =>
    client
      .post<ApiResponse<ResourceVersionDto[]>>(
        `/api/apps/${appId}/reviews/batch/${batchId}/approve`,
        params ?? {},
      )
      .then((res) => res.data.data as ResourceVersionDto[]),

  /** 批量驳回：批次内全部待审单级联驳回 */
  rejectBatch: (appId: string, batchId: string, comment: string) =>
    client
      .post<ApiResponse<{ rejected: number }>>(
        `/api/apps/${appId}/reviews/batch/${batchId}/reject`,
        { comment },
      )
      .then((res) => res.data.data as { rejected: number }),

  /** 改稿收编：人工编辑后的 AI 草稿直接落地为人工基线（原草稿记为已取代） */
  adopt: (
    appId: string,
    submissionId: string,
    params: { snapshot: Record<string, unknown>; comment?: string },
  ) =>
    client
      .post<ApiResponse<ResourceVersionDto>>(
        `/api/apps/${appId}/reviews/${submissionId}/adopt`,
        params,
      )
      .then((res) => res.data.data as ResourceVersionDto),
};

/** 快照规范形态（供 DiffDrawer 展示原始 JSON） */
export type { ResourceSnapshot };
