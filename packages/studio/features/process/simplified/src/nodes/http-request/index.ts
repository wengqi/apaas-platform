import type { FlowNodeRegistry } from '../../typings.js';
import { HttpRequestFormMeta } from './form-meta.js';

/**
 * HTTP 请求节点 — 调用外部 API。
 */
export const HttpRequestNodeRegistry: FlowNodeRegistry = {
  type: 'httpRequest',
  meta: {},
  info: {
    icon: '🌐',
    description: '发起 HTTP 请求，调用外部 API 或 Webhook。',
  },
  formMeta: HttpRequestFormMeta,
};
