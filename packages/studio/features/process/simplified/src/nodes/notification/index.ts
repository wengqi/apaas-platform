import type { FlowNodeRegistry } from '../../typings.js';
import { NotificationFormMeta } from './form-meta.js';

/**
 * 通知节点 — 发送邮件/消息通知。
 */
export const NotificationNodeRegistry: FlowNodeRegistry = {
  type: 'notification',
  meta: {},
  info: {
    icon: '📧',
    description: '发送通知：邮件、站内消息、Webhook 等。',
  },
  formMeta: NotificationFormMeta,
};
