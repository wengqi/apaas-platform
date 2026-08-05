/**
 * 流程引擎 类型契约 —— 自研流程引擎（对齐飞书 aPaaS）。
 *
 * 核心设计（对标飞书 aPaaS + flowgram.ai）：
 * - **自研执行引擎**：基于状态机 + BullMQ 异步队列，TS 全栈进程内集成。
 * - **单模式编辑器**：基于 flowgram.ai Free Layout，编辑器产出 WorkflowSchema JSON。
 * - **内部执行格式 = WorkflowSchema**（自研引擎原生消费，零翻译）。
 * - **与 flowgram.ai 数据结构对齐**：节点图 JSON 直接复用其 schema。
 *
 * @see docs/research/RESEARCH-flowgram-ai.md  flowgram.ai 调研报告
 * @see docs/prd/PRD-process.md  产品需求
 */

import type {
  ISODateString,
  ObjectId,
  ProcessId,
  TenantId,
} from '../common/index.js';

// ---------------------------------------------------------------------------
// 流程定义（元数据）
// ---------------------------------------------------------------------------

/**
 * 流程定义（元数据）。
 *
 * 内部执行格式统一为 WorkflowSchema JSON（自研引擎原生消费）。
 * 编辑器直接编辑/执行 workflowSchema，零翻译层。
 */
export interface ProcessDef {
  id: ProcessId;
  tenantId: TenantId;
  /** 流程 Key（租户内唯一） */
  processKey: string;
  name: string;
  /** ⭐ 内部执行格式：WorkflowSchema JSON。自研引擎原生消费。 */
  workflowSchema: WorkflowSchema;
  /** 版本号（每次发布自增） */
  version: number;
  /** 状态 */
  status: ProcessStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export enum ProcessStatus {
  Draft = 'draft',
  Published = 'published',
  Deprecated = 'deprecated',
}

// ---------------------------------------------------------------------------
// WorkflowSchema —— 与 flowgram.ai 数据结构对齐
// ---------------------------------------------------------------------------

/**
 * 工作流 Schema（节点图 JSON）。
 * 自研引擎的核心执行格式，直接由编辑器产出。
 *
 * 数据结构与 flowgram.ai 的 WorkflowSchema 对齐，确保零翻译。
 */
export interface WorkflowSchema {
  /** 节点列表 */
  nodes: WorkflowNode[];
  /** 连线列表 */
  edges: WorkflowEdge[];
  /** 分组（可选，用于画布区域划分） */
  groups?: WorkflowGroup[];
  /** 全局变量定义（JSON Schema 格式） */
  globalVariable?: IJsonSchema;
}

/** 节点 ID */
export type NodeId = string;
/** 端口 ID */
export type PortId = string;

/**
 * 工作流节点。
 *
 * 对齐 flowgram.ai WorkflowNodeSchema，并扩展 aPaaS 业务节点类型。
 * type 字段为字符串（飞书式业务类型名），自研引擎根据 type 路由到对应执行器。
 */
export interface WorkflowNode {
  id: NodeId;
  /** 节点类型（aPaaS 业务类型名） */
  type: SimplifiedNodeType | string;
  /** 节点元信息（位置等画布属性） */
  meta: WorkflowNodeMeta;
  /** 节点数据（业务配置 + 输入输出） */
  data: WorkflowNodeData;
  /** 嵌套子节点（复合节点，如循环/条件分支内） */
  blocks?: WorkflowNode[];
  /** 复合节点内部连线 */
  edges?: WorkflowEdge[];
}

export interface WorkflowNodeMeta {
  /** 画布坐标（自由布局） */
  position?: { x: number; y: number };
}

/**
 * 节点数据。
 * 对齐 flowgram.ai 的 IFlowValue 四态值系统（constant/ref/expression/template）。
 */
export interface WorkflowNodeData {
  /** 节点标题 */
  title?: string;
  /** 输入值（key = 参数名，value = IFlowValue 四态） */
  inputsValues?: Record<string, IFlowValue>;
  /** 输入参数 JSON Schema 定义 */
  inputs?: IJsonSchema;
  /** 输出参数 JSON Schema 定义 */
  outputs?: IJsonSchema;
  /** 节点类型特定配置（按 type 区分） */
  [key: string]: unknown;
}

/**
 * IFlowValue —— 四态值类型。
 * 对齐 flowgram.ai，是变量系统与节点数据绑定的桥梁。
 */
export type IFlowValue =
  | { type: 'constant'; content?: string | number | boolean }
  | { type: 'ref'; content?: string[] } // 引用其它变量路径
  | { type: 'expression'; content?: string } // 表达式
  | { type: 'template'; content?: string }; // 模板字符串插值

/** 工作流连线。 */
export interface WorkflowEdge {
  sourceNodeID: NodeId;
  targetNodeID: NodeId;
  sourcePortID?: PortId;
  targetPortID?: PortId;
  /** 连线标签（条件分支名） */
  label?: string;
  /** 条件表达式（条件分支出边） */
  condition?: string;
}

/** 工作流分组。 */
export interface WorkflowGroup {
  id: string;
  type: string;
  meta: { position: { x: number; y: number }; size: { width: number; height: number } };
}

/** JSON Schema 类型（简化，用于变量/输入输出定义）。 */
export type IJsonSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 节点类型（aPaaS 业务化封装）
// ---------------------------------------------------------------------------

/**
 * 节点类型 —— aPaaS 业务化封装。
 * 这些是编辑器（flowgram.ai Free Layout）中可用的节点类型。
 * 自研引擎为每种 type 注册对应的 NodeExecutor。
 */
export enum SimplifiedNodeType {
  // —— 触发与起止 ——
  /** 触发器（记录增删改/定时/手动/按钮） */
  Trigger = 'trigger',
  /** 默认开始 */
  Start = 'start',
  /** 结束 */
  End = 'end',

  // —— 数据操作 ——
  /** 对象操作（新增/更新/查询/删除记录） */
  ObjectOperation = 'object_operation',
  /** 批量操作 */
  BatchOperation = 'batch_operation',

  // —— 流程控制 ——
  /** 条件分支（if/else） */
  Condition = 'condition',
  /** 并行分支 */
  Parallel = 'parallel',
  /** 包容分支（多条件） */
  Inclusive = 'inclusive',
  /** 循环（for each） */
  Loop = 'loop',
  /** 延时 */
  Delay = 'delay',
  /** 等待条件 */
  WaitForCondition = 'wait_for_condition',
  /** 子流程调用 */
  SubProcess = 'sub_process',
  /** 跳出循环 */
  Break = 'break',
  /** 继续下一次循环 */
  Continue = 'continue',

  // —— 业务操作 ——
  /** 人工任务/审批 */
  UserTask = 'user_task',
  /** 发送通知 */
  Notification = 'notification',
  /** HTTP 请求/连接器 */
  HttpRequest = 'http_request',
  /** 赋值/设置变量 */
  Assign = 'assign',

  // —— 注释/装饰 ——
  /** 注释 */
  Comment = 'comment',
}

// ---------------------------------------------------------------------------
// 节点配置类型（与 SimplifiedNodeType 一一对应）
// ---------------------------------------------------------------------------

/** 触发器配置。 */
export interface TriggerConfig {
  triggerType: TriggerType;
  objectTrigger?: {
    objectId: ObjectId;
    event: 'create' | 'update' | 'delete';
    /** 触发条件表达式（可选，满足才触发） */
    condition?: string;
  };
  cron?: string;
}

export enum TriggerType {
  RecordEvent = 'record_event',
  Schedule = 'schedule',
  Manual = 'manual',
  ButtonClick = 'button_click',
}

/** 对象操作配置。 */
export interface ObjectOperationConfig {
  operation: 'create' | 'update' | 'query' | 'delete';
  objectId: ObjectId;
  fieldMapping?: Record<string, string>;
  filter?: string;
  /** 查询结果映射到变量名 */
  resultVariable?: string;
}

/** 条件分支。 */
export interface ConditionBranch {
  label: string;
  /** JsonLogic JSON 规则。空 = else/default。向后兼容：也可能是旧格式 expr-eval 字符串 */
  condition?: object | string | null;
}

/** 通知配置。 */
export interface NotificationConfig {
  channel: 'in_app' | 'email' | 'webhook';
  recipients: string[];
  title: string;
  content: string;
}

/** 人工任务配置。 */
export interface UserTaskConfig {
  assignee?: string;
  candidateGroups?: string[];
  formKey?: string;
  taskName: string;
  dueDate?: string;
}

/** 抄送触发时机。 */
export type CcTrigger = 'onApprove' | 'onReject' | 'onComplete';

/** 抄送人类型。 */
export type CcAssigneeType = 'USER' | 'ROLE' | 'ORG';

/** 抄送配置（嵌入 UserTask 节点 data）。 */
export interface CcConfig {
  /** 是否启用抄送 */
  ccEnabled?: boolean;
  /** 抄送人类型 */
  ccAssigneeType?: CcAssigneeType;
  /** 抄送目标 ID 列表（用户 ID / 角色 ID / 组织 ID） */
  ccRecipients?: string[];
  /** 触发时机 */
  ccTrigger?: CcTrigger;
}

/** HTTP 请求配置（连接器）。 */
export interface HttpConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  responseMapping?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 流程运行时（流程实例）
// ---------------------------------------------------------------------------

/** 流程实例状态。 */
export enum ProcessInstanceState {
  Pending = 'pending',
  Running = 'running',
  Waiting = 'waiting', // 等待条件/人工任务
  Completed = 'completed',
  Failed = 'failed',
  Terminated = 'terminated',
  Cancelled = 'cancelled',
}

/** 流程实例。 */
export interface ProcessInstance {
  id: string;
  processDefId: ProcessId;
  processKey: string;
  version: number;
  state: ProcessInstanceState;
  /** 当前流程变量快照 */
  variables: Record<string, unknown>;
  /** 当前活跃节点 ID 列表（含等待中的节点） */
  activeNodes: string[];
  /** 已完成的节点 ID 列表 */
  completedNodes: string[];
  /** 触发来源 */
  triggeredBy: TriggerType;
  /** 触发者 */
  triggeredByUser?: string;
  /** 错误信息（state=failed 时） */
  error?: string;
  startTime: ISODateString;
  endTime?: ISODateString;
}

/** 节点执行状态（用于流程监控）。 */
export interface NodeExecutionStatus {
  nodeId: NodeId;
  state: 'idle' | 'processing' | 'success' | 'fail' | 'waiting' | 'skipped';
  startTime?: ISODateString;
  endTime?: ISODateString;
  error?: string;
  /** 节点输出（成功后） */
  outputs?: Record<string, unknown>;
}

/** 流程实例报告（轮询状态）。 */
export interface ProcessInstanceReport {
  instance: ProcessInstance;
  nodes: Record<NodeId, NodeExecutionStatus>;
}
