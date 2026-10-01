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
};

/** 快照规范形态（供 DiffDrawer 展示原始 JSON） */
export type { ResourceSnapshot };
