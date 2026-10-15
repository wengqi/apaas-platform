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
  taskName?: string;
  assignee: string | null;
  status: TaskStatus;
  decision: string | null;
  comment: string | null;
  formData: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
  /** 关联的流程实例（getTask 详情时返回）。 */
  instance?: {
    id: string;
    status: string;
    variables: Record<string, unknown> | null;
    triggerContext: Record<string, unknown> | null;
    environmentId?: string;
    frozenWorkflowSchema?: unknown;
    processDef: { name: string; apiName: string; appId: string };
  };
  /** 审批节点绑定的页面 ID（R1.3，无绑定为 null → 回退默认审批 UI）。 */
  boundPageId?: string | null;
  /** #16：节点是否允许驳回（undefined=允许）——任务中心据此禁用拒绝按钮。 */
  allowReject?: boolean;
  /** 语义裁决（2026-10-06）：节点是否配置了驳回跳转——未配置时运行时不提供驳回操作 */
  rejectConfigured?: boolean;
  /** #15：申请内容字段标签（apiName→label，触发对象字段定义）——
   *  未绑定审批页时把 inputs 从裸 key 渲染成友好键值表。 */
  inputFieldLabels?: Record<string, string>;
  /** 交互评审（2026-10-04）：申请内容"创建人"解析后的姓名（无记录上下文时缺省）。 */
  recordCreatorName?: string;
  /** R1.4：审批页按环境 bundle 渲染所需上下文（getTask 详情返回，随 processDef 恒存在）。 */
  appId: string;
  runtimeEnv?: string;
}

/** 分页任务结果。 */
export interface PaginatedTasks {
  items: ProcessTask[];
  total: number;
  page: number;
  pageSize: number;
}

/** 我发起的流程实例（GET /instances/mine，后端 toInstanceDto 投影的 UI 子集）。 */
export interface MyInstance {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  triggeredByUser?: string;
  processDef?: { name: string; apiName: string; version?: number };
  triggerContext?: Record<string, unknown> | null;
}

export const tasksApi = {
  /** 列出我的待办任务 */
  list: (params: { status?: string; page?: number; pageSize?: number }) =>
    apiClient.get('/tasks', { params }).then((res) => res.data.data as PaginatedTasks),

  /** 列出我发起的流程实例（任务中心「我发起的」视图） */
  listMyInstances: (params: { status?: string; page?: number; pageSize?: number }) =>
    apiClient.get('/instances/mine', { params }).then((res) => res.data.data as MyInstance[]),

  /** 获取任务详情 */
  get: (taskId: string) =>
    apiClient.get(`/tasks/${taskId}`).then((res) => res.data.data as ProcessTask),

  /** 完成任务（审批） */
  complete: (
    taskId: string,
    body: { decision: string; comment?: string; formData?: Record<string, unknown> },
  ) => apiClient.post(`/tasks/${taskId}/complete`, body).then((res) => res.data.data),

  /** 转办任务 */
  delegate: (taskId: string, delegatedTo: string) =>
    apiClient.post(`/tasks/${taskId}/delegate`, { delegatedTo }).then((res) => res.data.data),

  /** 获取流程轨迹 */
  getTrace: (instanceId: string) =>
    apiClient
      .get(`/instances/${instanceId}/trace`)
      .then((res) => res.data.data as ProcessTraceData),
};

/** 节点执行状态。 */
export type NodeTraceStatus = 'COMPLETED' | 'RUNNING' | 'WAITING' | 'SKIPPED' | 'PENDING';

/** 流程轨迹数据。 */
export interface ProcessTraceData {
  instance: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    activeNodeIds: string[];
  };
  schema: {
    nodes: Array<{
      id: string;
      type: string;
      data?: Record<string, unknown>;
      traceStatus: NodeTraceStatus;
      traceStartedAt?: string;
      traceFinishedAt?: string;
    }>;
    edges: Array<{ sourceNodeID: string; targetNodeID: string }>;
  };
  tasks: Array<{
    id: string;
    nodeId: string;
    taskName: string;
    assignee: string;
    status: string;
    decision: string;
    comment: string;
    createdAt: string;
    completedAt?: string;
  }>;
}
