/**
 * 流程 API（runtime 侧最小面）——供应用门户"流程发起"入口消费。
 */

import apiClient from './client';

export interface ProcessDefSummary {
  id: string;
  apiName: string;
  name: string;
  status: string;
  triggerType: string | null;
  workflowSchema: {
    nodes?: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
    edges?: unknown[];
  };
}

export const processesApi = {
  /** 应用下流程定义列表（live 表；已发布应用与发布快照同构） */
  list: (appId: string) =>
    apiClient.get(`/apps/${appId}/processes`).then((res) => res.data.data as ProcessDefSummary[]),
};
