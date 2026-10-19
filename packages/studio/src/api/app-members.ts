import client from './client.js';
import type { ApiResponse } from './client.js';

/**
 * 应用成员 API（ADR-0005 设计面 /design/apps/:appId/members）。
 * 清单对成员可读；候选集与写操作为所有者级（admin | owner），后端 assertOwnerAccess 兜底，
 * 前端按 myRole 隐藏入口（MEMBER 只读看名单）。
 */

export type AppMemberRole = 'owner' | 'member';

export interface AppMember {
  userId: string;
  name: string | null;
  email: string;
  role: AppMemberRole;
  addedBy: string | null;
  createdAt: string;
}

export interface AppMemberCandidate {
  userId: string;
  name: string;
  email: string;
}

const base = (appId: string) => `/api/design/apps/${appId}/members`;

export const appMembersApi = {
  list: (appId: string) =>
    client
      .get<ApiResponse<{ items: AppMember[] }>>(base(appId))
      .then((res) => (res.data.data as { items: AppMember[] }).items),

  candidates: (appId: string) =>
    client
      .get<ApiResponse<{ items: AppMemberCandidate[] }>>(`${base(appId)}/candidates`)
      .then((res) => (res.data.data as { items: AppMemberCandidate[] }).items),

  add: (appId: string, userId: string) =>
    client
      .post<ApiResponse<{ userId: string; role: AppMemberRole }>>(base(appId), { userId })
      .then((res) => res.data.data as { userId: string; role: AppMemberRole }),

  remove: (appId: string, userId: string) =>
    client
      .delete<ApiResponse<{ removed: boolean }>>(`${base(appId)}/${userId}`)
      .then((res) => res.data.data as { removed: boolean }),

  transferOwner: (appId: string, userId: string) =>
    client
      .post<ApiResponse<{ ownerUserId: string }>>(`${base(appId)}/owner`, { userId })
      .then((res) => res.data.data as { ownerUserId: string }),
};
