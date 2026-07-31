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
  ProcessDef,
  WorkflowSchema,
  ProcessInstance,
  NodeExecutionStatus,
  ProcessInstanceReport,
} from '@apaas/shared';
import type {
  EditorMode,
  ProcessStatus,
  TriggerType,
  ProcessInstanceState,
  NotificationChannel,
} from '../constants/process.js';

// ---------------------------------------------------------------------------
// 重新导出 shared 类型(便于上层统一从 api/processes 引入)
// ---------------------------------------------------------------------------

export type {
  ProcessDef,
  WorkflowSchema,
  WorkflowNode,
  WorkflowEdge,
  IFlowValue,
  ProcessInstance,
  NodeExecutionStatus,
  ProcessInstanceReport,
  TriggerConfig,
  ObjectOperationConfig,
  ConditionBranch,
  NotificationConfig,
  UserTaskConfig,
  HttpConfig,
  CapabilityCheckResult,
  UnsupportedElement,
} from '@apaas/shared';

export type { EditorMode, ProcessStatus, TriggerType, NotificationChannel };

// ---------------------------------------------------------------------------
// 请求体
// ---------------------------------------------------------------------------

export interface CreateProcessRequest {
  name: string;
  processKey: string;
  editorMode: EditorMode;
  triggerType?: TriggerType;
  /** 初始 WorkflowSchema(简化模式);不传后端生成空 start→end */
  workflowSchema?: WorkflowSchema;
  /** 初始 BPMN XML(标准模式) */
  bpmnXml?: string;
}

export interface UpdateProcessRequest {
  name?: string;
  workflowSchema?: WorkflowSchema;
  bpmnXml?: string;
  editorMode?: EditorMode;
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
  userId: string;
  comment?: string;
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

/** 简化模式空 WorkflowSchema(仅 start→end)。 */
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

/** 标准模式空 BPMN 2.0 XML(StartEvent→EndEvent)。 */
export function createEmptyBpmnXml(processKey: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processKey}" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="开始"/>
    <bpmn:endEvent id="EndEvent_1" name="结束"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processKey}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Box x="160" y="160" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Box x="360" y="160" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178"/>
        <di:waypoint x="360" y="178"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
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
      .get<ApiResponse<ProcessInstanceReport>>(`/api/process-instances/${instanceId}`)
      .then((res) => res.data.data as ProcessInstanceReport),

  /** 取消实例 */
  cancelInstance: (instanceId: string) =>
    client
      .post<ApiResponse<ProcessInstance>>(`/api/process-instances/${instanceId}/cancel`)
      .then((res) => res.data.data as ProcessInstance),

  // —— 人工任务 ——
  /** 任务列表(待审批/已审批) */
  listTasks: (filter: ListTasksParams) =>
    client
      .get<ApiResponse<UserTask[]>>(`/api/process-tasks`, {
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
      .post<ApiResponse<UserTask>>(`/api/process-tasks/${taskId}/complete`, {
        decision,
        comment,
      } satisfies CompleteTaskRequest)
      .then((res) => res.data.data as UserTask),

  /** 转办任务 */
  delegateTask: (taskId: string, userId: string, comment?: string) =>
    client
      .post<ApiResponse<UserTask>>(`/api/process-tasks/${taskId}/transfer`, {
        userId,
        comment,
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
