/**
 * 站内信类型契约 — 运行时通知消息。
 *
 * 流程通知节点（IN_APP 渠道）写入消息，用户在运行时前端查看。
 * 后端控制器：InAppMessageController（/api/notifications）。
 */

/** 站内消息。 */
export interface InAppMessage {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

/** 站内消息分页响应。 */
export interface InAppMessageListResponse {
  items: InAppMessage[];
  total: number;
  page: number;
  pageSize: number;
}

/** 未读数响应。 */
export interface InAppMessageUnreadCountResponse {
  count: number;
}
