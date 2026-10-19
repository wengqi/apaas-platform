/**
 * 云函数 API 客户端 — 与 @apaas/shared/cloud-function 类型对齐。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type {
  CloudFunction,
  CreateCloudFunctionRequest,
  UpdateCloudFunctionRequest,
  InvokeCloudFunctionRequest,
  CloudFunctionCallResult,
} from '@apaas/shared';

export type { CloudFunction, CloudFunctionCallResult } from '@apaas/shared';

function unwrap<T>(p: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  return p.then((res) => {
    const d = res.data;
    if (d && d.ok) {
      return d.data as T;
    }
    throw new Error(d?.error?.message ?? 'Unknown error');
  });
}

export const cloudFunctionsApi = {
  list: (appId: string) =>
    unwrap<CloudFunction[]>(client.get(`/api/v1/design/apps/${appId}/cloud-functions`)),

  get: (appId: string, id: string) =>
    unwrap<CloudFunction>(client.get(`/api/v1/design/apps/${appId}/cloud-functions/${id}`)),

  create: (appId: string, data: CreateCloudFunctionRequest) =>
    unwrap<CloudFunction>(client.post(`/api/v1/design/apps/${appId}/cloud-functions`, data)),

  update: (appId: string, id: string, data: UpdateCloudFunctionRequest) =>
    unwrap<CloudFunction>(client.put(`/api/v1/design/apps/${appId}/cloud-functions/${id}`, data)),

  delete: (appId: string, id: string) =>
    unwrap<null>(client.delete(`/api/v1/design/apps/${appId}/cloud-functions/${id}`)),

  publish: (appId: string, id: string) =>
    unwrap<CloudFunction>(
      client.post(`/api/v1/design/apps/${appId}/cloud-functions/${id}/publish`),
    ),

  invoke: (id: string, data: InvokeCloudFunctionRequest) =>
    unwrap<CloudFunctionCallResult>(client.post(`/api/v1/cloud-functions/${id}/invoke`, data)),
};
