/**
 * Schema 序列化器 — flowgram 内部格式 ↔ WorkflowSchema (SSOT) 双向转换。
 *
 * 这是"同源互转"的核心：
 *  - 简化模式编辑器产出/消费 flowgram 内部格式 (FlowDocumentJSON)
 *  - 转换为 WorkflowSchema JSON 后，存入 process_definitions.workflow_schema (Prisma)
 *  - 自研执行引擎直接消费 WorkflowSchema
 *
 * Phase 3 实现 bpmn-to-workflow / workflow-to-bpmn 时复用此模块。
 */

import type { FlowDocumentJSON, FlowNodeJSON } from './typings.js';
import type { WorkflowSchema, WorkflowNode } from '@apaas/shared';

/**
 * FlowDocumentJSON (flowgram 内部格式) → WorkflowSchema (SSOT)
 */
export function flowToWorkflowSchema(doc: FlowDocumentJSON): WorkflowSchema {
  const nodes = (doc.nodes || []).map(flowNodeToWorkflowNode);

  // 收集边：优先从顶层 doc.edges 获取；若为空，从节点内部 edges 属性提取
  let edges: WorkflowSchema['edges'];
  if (doc.edges && doc.edges.length > 0) {
    edges = doc.edges.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
    }));
  } else {
    // FlowGram FixedLayout 可能将边存在节点内部
    edges = [];
    for (const node of doc.nodes || []) {
      if (node.edges) {
        for (const e of node.edges) {
          edges.push({
            sourceNodeID: e.sourceNodeID,
            targetNodeID: e.targetNodeID,
            sourcePortID: e.sourcePortID,
            targetPortID: e.targetPortID,
          });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    groups: doc.groups as WorkflowSchema['groups'],
  };
}

function flowNodeToWorkflowNode(node: FlowNodeJSON): WorkflowNode {
  return {
    id: node.id,
    type: node.type as WorkflowNode['type'],
    meta: node.meta ?? {},
    data: {
      title: node.data?.title ?? node.type,
      ...(node.data ?? {}),
    },
    blocks: node.blocks?.map(flowNodeToWorkflowNode),
    edges: node.edges?.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
    })),
  } as WorkflowNode;
}

/**
 * WorkflowSchema (SSOT) → FlowDocumentJSON (flowgram 内部格式)
 */
export function workflowToFlowSchema(schema: WorkflowSchema): FlowDocumentJSON {
  return {
    nodes: (schema.nodes || []).map(workflowNodeToFlow),
    edges: (schema.edges || []).map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
    })),
    groups: schema.groups as unknown[],
  };
}

function workflowNodeToFlow(node: WorkflowNode): FlowNodeJSON {
  return {
    id: node.id,
    type: node.type,
    meta: (node.meta ?? {}) as Record<string, unknown>,
    data: node.data as FlowNodeJSON['data'],
    blocks: node.blocks?.map(workflowNodeToFlow),
    edges: node.edges?.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
    })),
  };
}
