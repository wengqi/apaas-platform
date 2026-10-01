/**
 * 环境管理 API 封装（R1.4）。
 *
 * 后端端点:
 *   GET  /api/apps/:appId/environments                       — 环境列表
 *   GET  /api/apps/:appId/environments/:env/deployments      — 发布历史
 *   POST /api/apps/:appId/environments/:env/preflight        — 发布预检
 *   POST /api/apps/:appId/environments/:env/publish          — 部署到环境
 *   POST /api/apps/:appId/environments/:env/rollback         — 环境回滚
 *   GET  /api/apps/:appId/env-vars?env=                      — 环境变量定义+值
 *   POST /api/apps/:appId/env-vars/defs                      — 新建定义
 *   POST /api/apps/:appId/env-vars/defs/:defId/delete        — 删除定义
 *   POST /api/apps/:appId/env-vars/defs/:defId/value?env=    — 设值
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type {
  AppEnvironmentDto,
  DeployPreflightDto,
  DeploymentDto,
  EnvVarDefDto,
  EnvVarValueDto,
} from '@apaas/shared';

export const environmentsApi = {
  list: (appId: string) =>
    client
      .get<ApiResponse<AppEnvironmentDto[]>>(`/api/apps/${appId}/environments`)
      .then((res) => res.data.data as AppEnvironmentDto[]),

  deployments: (appId: string, env: string) =>
    client
      .get<ApiResponse<DeploymentDto[]>>(`/api/apps/${appId}/environments/${env}/deployments`)
      .then((res) => res.data.data as DeploymentDto[]),

  preflight: (appId: string, env: string, versionId?: string) =>
    client
      .post<ApiResponse<DeployPreflightDto>>(`/api/apps/${appId}/environments/${env}/preflight`, {
        versionId,
      })
      .then((res) => res.data.data as DeployPreflightDto),

  deploy: (
    appId: string,
    env: string,
    params?: { versionId?: string; note?: string },
  ): Promise<{ environment: AppEnvironmentDto; deployment: DeploymentDto }> =>
    client
      .post<ApiResponse<{ environment: AppEnvironmentDto; deployment: DeploymentDto }>>(
        `/api/apps/${appId}/environments/${env}/publish`,
        params ?? {},
      )
      .then(
        (res) => res.data.data as { environment: AppEnvironmentDto; deployment: DeploymentDto },
      ),

  rollback: (
    appId: string,
    env: string,
    versionId: string,
    note?: string,
  ): Promise<{ environment: AppEnvironmentDto; deployment: DeploymentDto }> =>
    client
      .post<ApiResponse<{ environment: AppEnvironmentDto; deployment: DeploymentDto }>>(
        `/api/apps/${appId}/environments/${env}/rollback`,
        { versionId, note },
      )
      .then(
        (res) => res.data.data as { environment: AppEnvironmentDto; deployment: DeploymentDto },
      ),

  envVars: (appId: string, env: string) =>
    client
      .get<ApiResponse<{ defs: EnvVarDefDto[]; values: EnvVarValueDto[] }>>(
        `/api/apps/${appId}/env-vars`,
        { params: { env } },
      )
      .then((res) => res.data.data),

  createDef: (
    appId: string,
    params: { key: string; description?: string; required?: boolean; sensitive?: boolean },
  ) =>
    client
      .post<ApiResponse<EnvVarDefDto>>(`/api/apps/${appId}/env-vars/defs`, params)
      .then((res) => res.data.data as EnvVarDefDto),

  deleteDef: (appId: string, defId: string) =>
    client
      .post<ApiResponse<void>>(`/api/apps/${appId}/env-vars/defs/${defId}/delete`)
      .then((res) => res.data.data),

  setValue: (appId: string, defId: string, env: string, value: string) =>
    client
      .post<ApiResponse<EnvVarValueDto>>(
        `/api/apps/${appId}/env-vars/defs/${defId}/value`,
        {
          value,
        },
        { params: { env } },
      )
      .then((res) => res.data.data as EnvVarValueDto),
};
