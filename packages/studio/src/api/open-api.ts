/**
 * 开放 API（G6）客户端封装——服务身份管理 + 流程 API 版本发布。
 *
 * 端点:
 *   POST /api/design/apps/:appId/service-identities                    — 创建（明文一次）
 *   GET  /api/design/apps/:appId/service-identities                    — 列表
 *   POST /api/design/apps/:appId/service-identities/:id/revoke         — 吊销
 *   POST /api/design/apps/:appId/processes/:defId/api-release          — 发布为 API
 *   GET  /api/design/apps/:appId/processes/:defId/api-releases         — 发布历史
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type {
  ProcessApiReleaseCreatedDto,
  ProcessApiReleaseDto,
  ServiceIdentityCreatedDto,
  ServiceIdentityDto,
} from '@apaas/shared';

export const openApiAdminApi = {
  /** 创建服务身份（明文 key 仅此一次） */
  createIdentity: (appId: string, name: string) =>
    client
      .post<ApiResponse<ServiceIdentityCreatedDto>>(
        `/api/design/apps/${appId}/service-identities`,
        {
          name,
        },
      )
      .then((res) => res.data.data as ServiceIdentityCreatedDto),

  listIdentities: (appId: string) =>
    client
      .get<ApiResponse<ServiceIdentityDto[]>>(`/api/design/apps/${appId}/service-identities`)
      .then((res) => res.data.data as ServiceIdentityDto[]),

  revokeIdentity: (appId: string, identityId: string) =>
    client
      .post<ApiResponse<ServiceIdentityDto>>(
        `/api/design/apps/${appId}/service-identities/${identityId}/revoke`,
      )
      .then((res) => res.data.data as ServiceIdentityDto),

  /** 发布流程为开放 API（major 必填；破坏性变更 diff 随响应返回） */
  release: (appId: string, processDefId: string, majorVersion: number) =>
    client
      .post<ApiResponse<ProcessApiReleaseCreatedDto>>(
        `/api/design/apps/${appId}/processes/${processDefId}/api-release`,
        { majorVersion },
      )
      .then((res) => res.data.data as ProcessApiReleaseCreatedDto),

  listReleases: (appId: string, processDefId: string) =>
    client
      .get<ApiResponse<ProcessApiReleaseDto[]>>(
        `/api/design/apps/${appId}/processes/${processDefId}/api-releases`,
      )
      .then((res) => res.data.data as ProcessApiReleaseDto[]),
};
