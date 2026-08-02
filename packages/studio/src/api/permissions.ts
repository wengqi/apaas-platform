import client from './client.js';
import type { ApiResponse } from './client.js';

// ---------------------------------------------------------------------------
// 类型定义（与 @apaas/shared/permission 对齐，前端独立声明避免跨包导入）
// ---------------------------------------------------------------------------

export interface Role {
  id: string;
  tenantId: string;
  appId?: string;
  name: string;
  code: string;
  description?: string;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleRequest {
  name: string;
  code: string;
  description?: string;
  appId?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export type PermissionType = 'PAGE' | 'RECORD' | 'PROCESS' | 'DATA_MODEL' | 'CONNECTOR';
export type PermissionAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'EXECUTE' | 'APPROVE' | 'MANAGE';
export type PermissionEffect = 'ALLOW' | 'DENY';

export interface ConditionItem {
  field: string;
  operator: string;
  value: unknown;
}

export interface ConditionExpr {
  logic?: 'AND' | 'OR';
  conditions: ConditionItem[];
  groups?: ConditionExpr[];
}

export interface PermissionRule {
  id: string;
  tenantId: string;
  appId?: string;
  roleId: string;
  type: PermissionType;
  action: PermissionAction;
  targetId: string;
  targetNodeId?: string;
  condition?: ConditionExpr | null;
  fieldScope?: string[] | null;
  effect: PermissionEffect;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePermissionRuleRequest {
  roleId: string;
  type: PermissionType;
  action: PermissionAction;
  targetId: string;
  targetNodeId?: string;
  condition?: ConditionExpr | null;
  fieldScope?: string[] | null;
  effect?: PermissionEffect;
  appId?: string;
}

export type OrgNodeType = 'DEPARTMENT' | 'TEAM' | 'POSITION';

export interface OrgNode {
  id: string;
  tenantId: string;
  parentId?: string;
  name: string;
  code: string;
  nodeType: OrgNodeType;
  sort: number;
  createdAt: string;
  updatedAt: string;
  children?: OrgNode[];
  members?: { userId: string; joinedAt: string }[];
}

export interface CreateOrgNodeRequest {
  parentId?: string;
  name: string;
  code: string;
  nodeType?: OrgNodeType;
  sort?: number;
}

export interface UpdateOrgNodeRequest {
  name?: string;
  sort?: number;
  parentId?: string;
}

export interface UserInfo {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  avatar?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  roles?: Role[];
  userRoles?: { roleId: string; role: Role }[];
  orgMemberships?: { org: { id: string; name: string; code: string } }[];
}

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  roleIds?: string[];
  orgIds?: string[];
}

export interface UpdateUserRequest {
  name?: string;
  avatar?: string;
  status?: string;
}

export interface OrgRoleGrant {
  id: string;
  orgId: string;
  roleId: string;
  appId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API 封装
// ---------------------------------------------------------------------------

const unwrap = <T>(p: Promise<{ data: ApiResponse<T> }>) =>
  p.then((res) => res.data.data as T);

/** 角色 API。 */
export const rolesApi = {
  list: (appId?: string) =>
    unwrap<Role[]>(client.get('/api/permissions/roles', { params: { appId } })),
  get: (id: string) =>
    unwrap<Role>(client.get(`/api/permissions/roles/${id}`)),
  create: (data: CreateRoleRequest) =>
    unwrap<Role>(client.post('/api/permissions/roles', data)),
  update: (id: string, data: UpdateRoleRequest) =>
    unwrap<Role>(client.put(`/api/permissions/roles/${id}`, data)),
  delete: (id: string) =>
    unwrap<void>(client.delete(`/api/permissions/roles/${id}`)),
  getUsers: (id: string) =>
    unwrap<UserInfo[]>(client.get(`/api/permissions/roles/${id}/users`)),
  assignUsers: (id: string, userIds: string[]) =>
    unwrap<void>(client.post(`/api/permissions/roles/${id}/users`, { userIds })),
  removeUser: (id: string, userId: string) =>
    unwrap<void>(client.delete(`/api/permissions/roles/${id}/users/${userId}`)),
  getRules: (id: string) =>
    unwrap<PermissionRule[]>(client.get(`/api/permissions/roles/${id}/rules`)),
  setRules: (id: string, rules: CreatePermissionRuleRequest[]) =>
    unwrap<void>(client.put(`/api/permissions/roles/${id}/rules`, { rules })),
};

/** 组织架构 API。 */
export const orgsApi = {
  getTree: () =>
    unwrap<OrgNode[]>(client.get('/api/permissions/orgs')),
  getNode: (id: string) =>
    unwrap<OrgNode>(client.get(`/api/permissions/orgs/${id}`)),
  create: (data: CreateOrgNodeRequest) =>
    unwrap<OrgNode>(client.post('/api/permissions/orgs', data)),
  update: (id: string, data: UpdateOrgNodeRequest) =>
    unwrap<OrgNode>(client.put(`/api/permissions/orgs/${id}`, data)),
  delete: (id: string) =>
    unwrap<void>(client.delete(`/api/permissions/orgs/${id}`)),
  move: (id: string, parentId: string) =>
    unwrap<void>(client.post(`/api/permissions/orgs/${id}/move`, { parentId })),
  getMembers: (id: string) =>
    unwrap<UserInfo[]>(client.get(`/api/permissions/orgs/${id}/members`)),
  addMember: (id: string, userId: string) =>
    unwrap<void>(client.post(`/api/permissions/orgs/${id}/members`, { userId })),
  removeMember: (id: string, userId: string) =>
    unwrap<void>(client.delete(`/api/permissions/orgs/${id}/members/${userId}`)),
  grantRole: (id: string, roleId: string, appId?: string) =>
    unwrap<void>(client.post(`/api/permissions/orgs/${id}/roles`, { roleId, appId })),
  revokeRole: (id: string, roleId: string) =>
    unwrap<void>(client.delete(`/api/permissions/orgs/${id}/roles/${roleId}`)),
};

/** 用户管理 API。 */
export const usersApi = {
  list: (params?: { keyword?: string; orgId?: string; roleId?: string }) =>
    unwrap<UserInfo[]>(client.get('/api/permissions/users', { params })),
  get: (id: string) =>
    unwrap<UserInfo>(client.get(`/api/permissions/users/${id}`)),
  create: (data: CreateUserRequest) =>
    unwrap<UserInfo>(client.post('/api/permissions/users', data)),
  update: (id: string, data: UpdateUserRequest) =>
    unwrap<UserInfo>(client.put(`/api/permissions/users/${id}`, data)),
  delete: (id: string) =>
    unwrap<void>(client.delete(`/api/permissions/users/${id}`)),
  setRoles: (id: string, roleIds: string[]) =>
    unwrap<void>(client.put(`/api/permissions/users/${id}/roles`, { roleIds })),
  setOrgs: (id: string, orgIds: string[]) =>
    unwrap<void>(client.put(`/api/permissions/users/${id}/orgs`, { orgIds })),
};
