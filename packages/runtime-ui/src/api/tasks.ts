/**
 * 流程任务 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的 /api/tasks 端点。
 */

import apiClient from './client';

/** 任务状态。 */
export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELEGATED' | 'CANCELLED';

/** 人工任务。 */
export interface ProcessTask {
  id: string;
  instanceId: string;
  nodeId: string;
  assignee: string | null;
  status: TaskStatus;
  decision: string | null;
  comment: string | null;
  formData: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
}

/** 分页任务结果。 */
export interface PaginatedTasks {
  items: ProcessTask[];
  total: number;
  page: number;
  pageSize: number;
}

export const tasksApi = {
  /** 列出我的待办任务 */
  list: (params: { status?: string; page?: number; pageSize?: number }) =>
    apiClient
      .get('/tasks', { params })
      .then((res) => res.data.data as PaginatedTasks),

  /** 获取任务详情 */
  get: (taskId: string) =>
    apiClient
      .get(`/tasks/${taskId}`)
      .then((res) => res.data.data as ProcessTask),

  /** 完成任务（审批） */
  complete: (taskId: string, body: { decision: string; comment?: string; formData?: Record<string, unknown> }) =>
    apiClient
      .post(`/tasks/${taskId}/complete`, body)
      .then((res) => res.data.data),

  /** 转办任务 */
  delegate: (taskId: string, delegatedTo: string) =>
    apiClient
      .post(`/tasks/${taskId}/delegate`, { delegatedTo })
      .then((res) => res.data.data),
};
