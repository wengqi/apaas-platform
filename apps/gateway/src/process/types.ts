/**
 * 流程引擎 — 类型契约（执行内核）。
 *
 * 对齐 packages/shared/src/process/index.ts 的 WorkflowSchema / IFlowValue。
 * 执行器按 node.type 路由分发，引擎核心不感知具体节点语义。
 */

import type { Prisma } from '@apaas/db';
import type {
  IFlowValue,
  WorkflowEdge,
  WorkflowNode,
} from '@apaas/shared';

/** 流程实例行（Prisma ProcessInstance，含 processDef 关联时使用）。 */
export type InstanceRow = Prisma.ProcessInstanceGetPayload<{
  include: { processDef: true };
}>;

/** 节点执行上下文 —— 引擎在执行节点前构造，传入执行器。 */
export interface ExecutionContext {
  /** 流程实例（含关联的流程定义） */
  instance: InstanceRow;
  /** 当前节点定义（WorkflowSchema 中的节点） */
  node: WorkflowNode;
  /** 当前节点执行记录 ID（UserTask 等需关联 NodeExecution） */
  nodeExecutionId: string;
  /** 当前节点的出边列表（供条件/并行执行器选择分支） */
  outgoingEdges: WorkflowEdge[];
  /** 已解析四态后的输入值（来自 node.data.inputsValues） */
  inputs: Record<string, unknown>;
  /** 流程变量作用域（读写）：{ global: {...}, [nodeId]: { output: {...} } } */
  variables: Record<string, unknown>;
  /** 租户 ID */
  tenantId: string;
  /** 应用 ID（流程归属应用） */
  appId: string;
  /**
   * 启动子流程实例（供 SubProcessExecutor 递归调用，避免 DI 循环依赖）。
   * 返回子流程实例 ID。
   */
  startSubProcess: (
    processDefId: string,
    triggerContext: Record<string, unknown>,
  ) => Promise<string>;

  /**
   * 调度延时恢复（供 DelayExecutor 调用 BullMQ delayed job，避免 DI 循环依赖）。
   * 调用后实例令牌暂停，到时由 Worker 恢复推进。
   */
  scheduleDelay: (
    instanceId: string,
    nodeId: string,
    delayMs: number,
  ) => Promise<void>;
}

/** 节点执行结果。 */
export interface NodeExecutionResult {
  /** 节点输出（写入变量作用域 [nodeId].output） */
  output?: Record<string, unknown>;
  /**
   * 下一节点 ID 列表。
   * - 未提供时：引擎取当前节点的所有出边目标。
   * - 条件/并行节点可显式指定（多个）。
   */
  nextNodeIds?: string[];
  /** 是否暂停（人工任务等返回 true，引擎停止推进并置实例为 WAITING_USER_TASK） */
  wait?: boolean;
}

/**
 * 节点执行器契约 —— 每种 node.type 注册一个执行器。
 * 引擎按 node.type 从注册表查找并调用。
 */
export interface NodeExecutor {
  /** 对应 SimplifiedNodeType（snake_case） */
  readonly type: string;
  execute(ctx: ExecutionContext): Promise<NodeExecutionResult>;
}

/** 重新导出四态值类型，便于执行器引用。 */
export type { IFlowValue };
