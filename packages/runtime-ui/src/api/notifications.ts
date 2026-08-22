/**
 * 站内信 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的 /api/notifications 端点。
 */

import apiClient from './client';
import type {
  InAppMessage,
  InAppMessageListResponse,
  InAppMessageUnreadCountResponse,
} from '@apaas/shared';

export const notificationsApi = {
  /** 获取站内消息列表（分页，支持仅未读过滤） */
  list: (params: { page?: number; pageSize?: number; unreadOnly?: boolean }) =>
    apiClient
      .get<{ ok: true; data: InAppMessageListResponse }>('/notifications', { params })
      .then((res) => res.data.data),

  /** 获取未读消息数 */
  getUnreadCount: () =>
    apiClient
      .get<{ ok: true; data: InAppMessageUnreadCountResponse }>('/notifications/unread-count')
      .then((res) => res.data.data.count),

  /** 标记单条消息为已读 */
  markAsRead: (id: string) =>
    apiClient
      .put<{ ok: true; data: { read: boolean } }>(`/notifications/${id}/read`)
      .then((res) => res.data.data),

  /** 标记所有消息为已读 */
  markAllRead: () =>
    apiClient
      .put<{ ok: true; data: { marked: number } }>('/notifications/read-all')
      .then((res) => res.data.data.marked),
};

export type { InAppMessage };
