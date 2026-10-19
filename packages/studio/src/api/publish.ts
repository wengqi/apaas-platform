import client from './client.js';
import type { ApiResponse } from './client.js';
import type {
  AppVersion,
  AppVersionSummary,
  CheckResult,
  ChangeSet,
  AppCheckRecord,
  PublishAppRequest,
} from '@apaas/shared';

/**
 * 发布相关 API 封装。
 *
 * 后端端点:
 *   POST   /api/design/apps/:appId/check              — 预检
 *   GET    /api/design/apps/:appId/checks             — 预检记录列表
 *   GET    /api/design/apps/:appId/changes            — 变更清单
 *   POST   /api/design/apps/:appId/publish            — 发布新版本
 *   GET    /api/design/apps/:appId/versions           — 版本列表
 *   GET    /api/design/apps/:appId/versions/:versionId — 版本详情
 *   POST   /api/design/apps/:appId/versions/:versionId/rollback — 回滚
 */
export const publishApi = {
  /** 执行预检 */
  check: (appId: string) =>
    client
      .post<ApiResponse<CheckResult>>(`/api/design/apps/${appId}/check`)
      .then((res) => res.data.data as CheckResult),

  /** 获取预检记录列表 */
  listChecks: (appId: string) =>
    client
      .get<ApiResponse<AppCheckRecord[]>>(`/api/design/apps/${appId}/checks`)
      .then((res) => res.data.data as AppCheckRecord[]),

  /** 获取变更清单 */
  getChanges: (appId: string) =>
    client
      .get<ApiResponse<ChangeSet>>(`/api/design/apps/${appId}/changes`)
      .then((res) => res.data.data as ChangeSet),

  /** 发布应用 */
  publish: (appId: string, params: PublishAppRequest) =>
    client
      .post<ApiResponse<AppVersion>>(`/api/design/apps/${appId}/publish`, params)
      .then((res) => res.data.data as AppVersion),

  /** 获取版本列表 */
  listVersions: (appId: string) =>
    client
      .get<ApiResponse<AppVersionSummary[]>>(`/api/design/apps/${appId}/versions`)
      .then((res) => res.data.data as AppVersionSummary[]),

  /** 获取版本详情 */
  getVersion: (appId: string, versionId: string) =>
    client
      .get<ApiResponse<AppVersion>>(`/api/design/apps/${appId}/versions/${versionId}`)
      .then((res) => res.data.data as AppVersion),

  /** 回滚到指定版本 */
  rollback: (appId: string, versionId: string) =>
    client
      .post<ApiResponse<AppVersion>>(`/api/design/apps/${appId}/versions/${versionId}/rollback`)
      .then((res) => res.data.data as AppVersion),
};
