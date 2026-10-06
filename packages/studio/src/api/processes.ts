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
  WorkflowSchema,
  ProcessInstance,
  ProcessInstanceReport,
  ProcessDef,
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

export type {
  WorkflowSchema,
  WorkflowNode,
  ProcessInstance,
  ProcessInstanceReport,
} from '@apaas/shared';

export type { ProcessDef, ProcessStatus, TriggerType, NotificationChannel };

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
// 效率分析（P1 运维治理，与 gateway ProcessAnalyticsService 返回结构对齐）
// ---------------------------------------------------------------------------

/** 流程实例汇总指标。 */
export interface ProcessTotals {
  total: number;
  running: number;
  waitingUserTask: number;
  completed: number;
  failed: number;
  terminated: number;
  timedOut: number;
  /** COMPLETED / 终态数；无终态实例时 null */
  completionRate: number | null;
  avgDurationMs: number | null;
  maxDurationMs: number | null;
}

/** 按流程定义拆分的效率指标。 */
export interface ProcessDefAnalytics {
  processDefId: string;
  name: string;
  apiName: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  timedOut: number;
  completionRate: number | null;
  avgDurationMs: number | null;
}

export interface ProcessAnalyticsResult {
  totals: ProcessTotals;
  byProcess: ProcessDefAnalytics[];
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
  /** 正文模版(支持 ${var} 插值) —— 与后端 DTO 字段名一致(bodyTemplate) */
  bodyTemplate: string;
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
  bodyTemplate: string;
  variables: NotificationTemplateVariable[];
}

export interface UpdateTemplateRequest {
  name?: string;
  channel?: NotificationChannel;
  titleTemplate?: string;
  bodyTemplate?: string;
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
  /** 效率分析（平均耗时/完成率/超时数，按流程拆分） */
  analytics: (appId: string) =>
    client
      .get<ApiResponse<ProcessAnalyticsResult>>(`/api/processes/analytics`, {
        params: { appId },
      })
      .then((res) => res.data.data as ProcessAnalyticsResult),

  /** 启动流程实例 */
  start: (processId: string, triggerContext: StartProcessRequest) =>
    client
      .post<ApiResponse<ProcessInstance>>(`/api/processes/${processId}/start`, triggerContext)
      .then((res) => res.data.data as ProcessInstance),

  /** 实例列表 */
  listInstances: (processId: string, params?: ListInstancesParams) =>
    client
      .get<ApiResponse<ProcessInstance[]>>(`/api/processes/${processId}/instances`, {
        params: { state: params?.state },
      })
      .then((res) => res.data.data as ProcessInstance[]),

  /** 实例详情(含节点执行状态)。
   *
   * QA 2026-10-06 修复（监控页点"详情"整页报错）：后端 GET /api/instances/:id
   * 返回扁平实例 DTO（nodeExecutions 数组），并非 shared 契约的
   * ProcessInstanceReport { instance, nodes }——此前直接透传导致
   * InstanceDetail 读取 report.instance.state 抛 TypeError、整页崩溃。
   * 本处在 API 层单点适配为契约形状；NodeExecStatus 枚举与
   * NodeExecutionStatus.state 值域一一对应，仅需字段改名。 */
  getInstance: (instanceId: string) =>
    client
      .get<
        ApiResponse<
          ProcessInstance & {
            nodeExecutions?: Array<{
              nodeId: string;
              status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'WAITING' | 'SKIPPED';
              startedAt: string | null;
              finishedAt: string | null;
              error: string | null;
            }>;
          }
        >
      >(`/api/instances/${instanceId}`)
      .then((res) => {
        const dto = res.data.data!;
        const nodes = Object.fromEntries(
          (dto.nodeExecutions ?? []).map((n) => [
            n.nodeId,
            {
              nodeId: n.nodeId,
              state: n.status,
              startTime: n.startedAt ?? undefined,
              endTime: n.finishedAt ?? undefined,
              error: n.error ?? undefined,
            },
          ]),
        );
        return { instance: dto, nodes } as ProcessInstanceReport;
      }),

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
      .post<ApiResponse<NotificationTemplate>>(`/api/apps/${appId}/notification-templates`, data)
      .then((res) => res.data.data as NotificationTemplate),

  /** 更新模版 */
  updateTemplate: (templateId: string, data: UpdateTemplateRequest) =>
    client
      .put<ApiResponse<NotificationTemplate>>(`/api/notification-templates/${templateId}`, data)
      .then((res) => res.data.data as NotificationTemplate),

  /** 删除模版 */
  deleteTemplate: (templateId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/notification-templates/${templateId}`)
      .then((res) => res.data.data as { deleted: boolean }),
};
