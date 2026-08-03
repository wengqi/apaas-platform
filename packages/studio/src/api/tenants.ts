import client from './client.js';
import type { ApiResponse } from './client.js';

/** 租户列表项。 */
export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  userCount: number;
  appCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 租户详情。 */
export interface TenantDetail extends TenantSummary {
  roleCount: number;
  orgCount: number;
}

/** 租户内用户（只读）。 */
export interface TenantUser {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: { code: string; name: string }[];
  createdAt: string;
}

/** 租户内应用（只读）。 */
export interface TenantApp {
  id: string;
  name: string;
  apiName: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const tenantsApi = {
  /** 租户列表。 */
  list: () => client.get<ApiResponse<TenantSummary[]>>('/api/tenants'),

  /** 创建租户。 */
  create: (data: { name: string; slug: string; description?: string }) =>
    client.post<ApiResponse<TenantSummary>>('/api/tenants', data),

  /** 租户详情。 */
  get: (id: string) => client.get<ApiResponse<TenantDetail>>(`/api/tenants/${id}`),

  /** 更新租户。 */
  update: (id: string, data: { name?: string; description?: string }) =>
    client.patch<ApiResponse<TenantDetail>>(`/api/tenants/${id}`, data),

  /** 挂起租户。 */
  suspend: (id: string) => client.post<ApiResponse<TenantDetail>>(`/api/tenants/${id}/suspend`),

  /** 激活租户。 */
  activate: (id: string) => client.post<ApiResponse<TenantDetail>>(`/api/tenants/${id}/activate`),

  /** 分配租户管理员。 */
  assignAdmin: (id: string, data: { email: string; name: string; password: string }) =>
    client.post<ApiResponse<{ id: string; email: string; name: string }>>(`/api/tenants/${id}/admins`, data),

  /** 查看租户内用户列表。 */
  getUsers: (id: string) => client.get<ApiResponse<TenantUser[]>>(`/api/tenants/${id}/users`),

  /** 查看租户内应用列表。 */
  getApps: (id: string) => client.get<ApiResponse<TenantApp[]>>(`/api/tenants/${id}/apps`),
};
