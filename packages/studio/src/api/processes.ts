/**
 * 流程引擎 API 封装。
 *
 * 类型契约对齐 packages/shared/src/process/index.ts(SSOT)。
 * 因流程编辑器需封装 SimplifiedProcessEditor(其依赖 @apaas/shared),
 * 本模块直接从 @apaas/shared 导入类型,避免重复声明导致的类型漂移。
 *
 * 后端响应统一包裹为 { ok: true, data: ... },取 res.data.data。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type {
  ProcessDef as SharedProcessDef,
  WorkflowSchema,
  ProcessInstance,
  ProcessInstanceReport,
} from '@apaas/shared';
import type {
  ProcessStatus,
  TriggerType,
  ProcessInstanceState,
  NotificationChannel,
} from '../constants/process.js';

// ---------------------------------------------------------------------------
// 重新导出 shared 类型(便于上层统一从 api/processes 引入)
// ---------------------------------------------------------------------------

export type { WorkflowSchema, WorkflowNode, ProcessInstance, ProcessInstanceReport } from '@apaas/shared';

export type { ProcessStatus, TriggerType, NotificationChannel };

/** 节点执行状态（流程轨迹用）。 */
export type NodeTraceStatus = 'COMPLETED' | 'RUNNING' | 'WAITING' | 'SKIPPED' | 'PENDING';

/** 流程轨迹数据。 */
export interface ProcessTraceData {
  instance: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    triggerContext: unknown;
    variables: unknown;
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

/**
 * 流程定义(UI 扩展)。
 *
 * 在 shared 的 ProcessDef 基础上补充 UI 层使用的字段(appId / triggerType),
 * 这些字段后端实际返回(shared ProcessDef 未显式声明,但 API 响应包含)。
 */
export interface ProcessDef extends SharedProcessDef {
  /** 所属应用 ID(UI 层使用) */
  appId?: string;
  /** 触发器类型(UI 层使用,对齐 TriggerType) */
  triggerType?: TriggerType;
}

// ---------------------------------------------------------------------------
// 请求体
// ---------------------------------------------------------------------------

export interface CreateProcessRequest {
  name: string;
  apiName: string;
  triggerType?: TriggerType;
  /** 初始 WorkflowSchema;不传后端生成空 start→end */
  workflowSchema?: WorkflowSchema;
}

export interface UpdateProcessRequest {
  name?: string;
  workflowSchema?: WorkflowSchema;
  triggerType?: TriggerType;
  status?: ProcessStatus;
}

export interface StartProcessRequest {
  processKey: string;
  variables: Record<string, unknown>;
}

export interface ListInstancesParams {
  processDefId?: string;
  state?: ProcessInstanceState;
}

export interface ListTasksParams {
  assignee?: string;
  status?: 'pending' | 'completed';
  processDefId?: string;
}

export interface CompleteTaskRequest {
  decision: 'approve' | 'reject';
  comment?: string;
}

export interface DelegateTaskRequest {
  delegatedTo: string;
}

// ---------------------------------------------------------------------------
// 人工任务 / 通知模版(前端宽松类型,后端运行时持久化)
// ---------------------------------------------------------------------------

/** 人工任务(运行时)。 */
export interface UserTask {
  id: string;
  instanceId: string;
  processDefId: string;
  processName?: string;
  nodeId: string;
  taskName: string;
  /** 发起人 */
  starter?: string;
  /** 到达时间 */
  arrivedAt: string;
  /** 截止时间 */
  dueAt?: string;
  /** 状态 */
  status: 'pending' | 'completed';
  /** 审批结果(已审批时) */
  decision?: 'approve' | 'reject';
  /** 审批意见(已审批时) */
  comment?: string;
  /** 审批时间(已审批时) */
  completedAt?: string;
  /** 申请内容(变量快照) */
  variables?: Record<string, unknown>;
  /** 任务表单 key */
  formKey?: string;
}

/** 通知模版。 */
export interface NotificationTemplate {
  id: string;
  appId: string;
  name: string;
  channel: NotificationChannel;
  /** 标题模版(支持 ${var} 插值) */
  titleTemplate: string;
  /** 正文模版(支持 ${var} 插值) */
  contentTemplate: string;
  /** 变量定义 */
  variables: NotificationTemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplateVariable {
  name: string;
  description?: string;
  /** 示例值(用于预览) */
  sampleValue?: string;
}

export interface CreateTemplateRequest {
  name: string;
  channel: NotificationChannel;
  titleTemplate: string;
  contentTemplate: string;
  variables: NotificationTemplateVariable[];
}

export interface UpdateTemplateRequest {
  name?: string;
  channel?: NotificationChannel;
  titleTemplate?: string;
  contentTemplate?: string;
  variables?: NotificationTemplateVariable[];
}

// ---------------------------------------------------------------------------
// 默认空 Schema(新建流程用)
// ---------------------------------------------------------------------------

/** 空 WorkflowSchema(仅 start→end)。 */
export function createEmptyWorkflowSchema(): WorkflowSchema {
  return {
    nodes: [
      {
        id: 'start_0',
        type: 'start',
        meta: {},
        data: {
          title: '开始',
          outputs: {
            type: 'object',
            properties: {
              recordId: { type: 'string', description: '触发记录 ID' },
            },
          },
        },
      },
      {
        id: 'end_0',
        type: 'end',
        meta: {},
        data: { title: '结束' },
      },
    ],
    edges: [{ sourceNodeID: 'start_0', targetNodeID: 'end_0' }],
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const processesApi = {
  // —— 流程定义 CRUD ——
  /** 流程列表 */
  list: (appId: string) =>
    client
      .get<ApiResponse<ProcessDef[]>>(`/api/apps/${appId}/processes`)
      .then((res) => res.data.data as ProcessDef[]),

  /** 流程详情 */
  get: (processId: string) =>
    client
      .get<ApiResponse<ProcessDef>>(`/api/processes/${processId}`)
      .then((res) => res.data.data as ProcessDef),

  /** 创建流程 */
  create: (appId: string, data: CreateProcessRequest) =>
    client
      .post<ApiResponse<ProcessDef>>(`/api/apps/${appId}/processes`, data)
      .then((res) => res.data.data as ProcessDef),

  /** 更新流程(草稿保存) */
  update: (processId: string, data: UpdateProcessRequest) =>
    client
      .put<ApiResponse<ProcessDef>>(`/api/processes/${processId}`, data)
      .then((res) => res.data.data as ProcessDef),

  /** 删除流程 */
  delete: (processId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/processes/${processId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 发布流程(version+1, status=PUBLISHED) */
  publish: (processId: string) =>
    client
      .post<ApiResponse<ProcessDef>>(`/api/processes/${processId}/publish`)
      .then((res) => res.data.data as ProcessDef),

  // —— 流程实例 / 监控 ——
  /** 启动流程实例 */
  start: (processId: string, triggerContext: StartProcessRequest) =>
    client
      .post<ApiResponse<ProcessInstance>>(
        `/api/processes/${processId}/start`,
        triggerContext,
      )
      .then((res) => res.data.data as ProcessInstance),

  /** 实例列表 */
  listInstances: (processId: string, params?: ListInstancesParams) =>
    client
      .get<ApiResponse<ProcessInstance[]>>(`/api/processes/${processId}/instances`, {
        params: { state: params?.state },
      })
      .then((res) => res.data.data as ProcessInstance[]),

  /** 实例详情(含节点执行状态) */
  getInstance: (instanceId: string) =>
    client
      .get<ApiResponse<ProcessInstanceReport>>(`/api/instances/${instanceId}`)
      .then((res) => res.data.data as ProcessInstanceReport),

  /** 流程轨迹（节点状态 + 连线） */
  getTrace: (instanceId: string) =>
    client
      .get<ApiResponse<ProcessTraceData>>(`/api/instances/${instanceId}/trace`)
      .then((res) => res.data.data as ProcessTraceData),

  /** 取消实例 */
  cancelInstance: (instanceId: string) =>
    client
      .post<ApiResponse<ProcessInstance>>(`/api/instances/${instanceId}/cancel`)
      .then((res) => res.data.data as ProcessInstance),

  // —— 人工任务 ——
  /** 任务列表(待审批/已审批) */
  listTasks: (filter: ListTasksParams) =>
    client
      .get<ApiResponse<UserTask[]>>(`/api/tasks`, {
        params: {
          assignee: filter.assignee,
          status: filter.status,
          processDefId: filter.processDefId,
        },
      })
      .then((res) => res.data.data as UserTask[]),

  /** 完成任务(审批/驳回) */
  completeTask: (taskId: string, decision: 'approve' | 'reject', comment?: string) =>
    client
      .post<ApiResponse<UserTask>>(`/api/tasks/${taskId}/complete`, {
        decision,
        comment,
      } satisfies CompleteTaskRequest)
      .then((res) => res.data.data as UserTask),

  /** 转办任务 */
  delegateTask: (taskId: string, delegatedTo: string) =>
    client
      .post<ApiResponse<UserTask>>(`/api/tasks/${taskId}/delegate`, {
        delegatedTo,
      } satisfies DelegateTaskRequest)
      .then((res) => res.data.data as UserTask),

  // —— 通知模版 ——
  /** 模版列表 */
  listTemplates: (appId: string) =>
    client
      .get<ApiResponse<NotificationTemplate[]>>(`/api/apps/${appId}/notification-templates`)
      .then((res) => res.data.data as NotificationTemplate[]),

  /** 创建模版 */
  createTemplate: (appId: string, data: CreateTemplateRequest) =>
    client
      .post<ApiResponse<NotificationTemplate>>(
        `/api/apps/${appId}/notification-templates`,
        data,
      )
      .then((res) => res.data.data as NotificationTemplate),

  /** 更新模版 */
  updateTemplate: (templateId: string, data: UpdateTemplateRequest) =>
    client
      .put<ApiResponse<NotificationTemplate>>(
        `/api/notification-templates/${templateId}`,
        data,
      )
      .then((res) => res.data.data as NotificationTemplate),

  /** 删除模版 */
  deleteTemplate: (templateId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(
        `/api/notification-templates/${templateId}`,
      )
      .then((res) => res.data.data as { deleted: boolean }),
};
