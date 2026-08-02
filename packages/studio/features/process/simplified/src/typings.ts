/**
 * aPaaS 简化流程画布 — 类型定义
 *
 * 基于 flowgram.ai Fixed Layout，节点类型替换为 aPaaS 业务节点。
 * 对齐 packages/shared/src/process/index.ts 中的 WorkflowSchema。
 */

import type { FlowNodeRegistry as FlowgramNodeRegistry } from '@flowgram.ai/fixed-layout-editor';
import type { WorkflowSchema, WorkflowNode, SimplifiedNodeType } from '@apaas/shared';

/**
 * flowgram.ai 的节点注册表类型（从 fixed-layout-editor 导入的别名）。
 */
export type FlowNodeRegistry = FlowgramNodeRegistry;

/**
 * flowgram.ai 的文档 JSON 格式（编辑器内部格式,fixed-layout 的 FlowDocumentJSON）。
 */
export interface FlowDocumentJSON {
  nodes: FlowNodeJSON[];
  edges?: FlowEdgeJSON[];
  groups?: unknown[];
}

export interface FlowNodeJSON {
  id: string;
  type: string;
  meta?: Record<string, unknown>;
  data?: Record<string, unknown> & {
    title?: string;
    inputsValues?: Record<string, unknown>;
    inputs?: unknown;
    outputs?: unknown;
  };
  blocks?: FlowNodeJSON[];
  edges?: FlowEdgeJSON[];
}

export interface FlowEdgeJSON {
  sourceNodeID: string;
  targetNodeID: string;
  sourcePortID?: string;
  targetPortID?: string;
}

export { type WorkflowSchema, type WorkflowNode, type SimplifiedNodeType };
