/**
 * 变量树解析器 — 为条件表达式可视化模式提供可用变量列表。
 *
 * 根据 WorkflowSchema 的边关系，通过 BFS 反向遍历找到当前节点的所有上游节点，
 * 再根据各节点类型的输出 schema 构建扁平化变量选项列表。
 *
 * 后端 `buildEvalScope`（process-utils.ts）对变量作用域做同样的扁平化处理：
 * 遍历 `variables[nodeId].output` 的所有字段拍平到作用域顶层。
 * 因此条件表达式中直接用字段名引用（如 `decision == "APPROVED"`）。
 */

import type { WorkflowSchema, WorkflowNode } from '@apaas/shared';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface VariableOption {
  /** 字段名（用于表达式） */
  value: string;
  /** 显示标签 */
  label: string;
  /** 来源节点标题 */
  sourceNode?: string;
  /** 字段类型 */
  type?: string;
}

export interface OutputField {
  /** 字段名 */
  field: string;
  /** 中文标签 */
  label: string;
  /** 值类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
}

// ---------------------------------------------------------------------------
// 节点输出 Schema — 预定义每种节点类型的输出字段
// ---------------------------------------------------------------------------

export const NODE_OUTPUT_SCHEMA: Record<string, OutputField[]> = {
  start: [
    { field: 'recordId', label: '记录ID', type: 'string' },
  ],
  trigger: [
    { field: 'recordId', label: '触发记录ID', type: 'string' },
    { field: 'record', label: '触发记录', type: 'object' },
    { field: 'triggeredByUser', label: '触发用户', type: 'string' },
    { field: 'eventType', label: '事件类型', type: 'string' },
    { field: 'triggeredBy', label: '触发来源', type: 'string' },
  ],
  user_task: [
    { field: 'decision', label: '审批结果', type: 'string' },
    { field: 'comment', label: '审批意见', type: 'string' },
    { field: 'formData', label: '表单数据', type: 'object' },
    { field: 'assignee', label: '处理人', type: 'string' },
  ],
  object_operation: [
    { field: 'recordId', label: '记录ID', type: 'string' },
    { field: 'record', label: '记录数据', type: 'object' },
    { field: 'records', label: '记录列表', type: 'array' },
    { field: 'count', label: '数量', type: 'number' },
    { field: 'affectedCount', label: '影响行数', type: 'number' },
  ],
  http_request: [
    { field: 'statusCode', label: '状态码', type: 'number' },
    { field: 'responseBody', label: '响应体', type: 'object' },
    { field: 'success', label: '是否成功', type: 'boolean' },
  ],
  notification: [
    { field: 'messageId', label: '消息ID', type: 'string' },
    { field: 'success', label: '发送成功', type: 'boolean' },
    { field: 'channel', label: '通知渠道', type: 'string' },
  ],
  delay: [
    { field: 'delayedMs', label: '延时毫秒', type: 'number' },
  ],
  assign: [
    { field: 'value', label: '赋值结果', type: 'any' },
  ],
  sub_process: [
    { field: 'subInstanceId', label: '子流程实例ID', type: 'string' },
  ],
};

// ---------------------------------------------------------------------------
// 变量解析核心逻辑
// ---------------------------------------------------------------------------

/**
 * 通过 BFS 反向遍历边，找到当前节点的所有上游节点（含间接上游）。
 *
 * 从当前节点出发，沿着 edge.targetNodeID → edge.sourceNodeID 反向遍历，
 * 收集所有可达的源节点。跳过 block 类型的节点（条件分支的子块）。
 */
function findUpstreamNodes(schema: WorkflowSchema, currentNodeId: string): WorkflowNode[] {
  const nodeMap = new Map<string, WorkflowNode>();
  const collectNodes = (nodes: WorkflowNode[]): void => {
    for (const n of nodes) {
      nodeMap.set(n.id, n);
      if (n.blocks) collectNodes(n.blocks);
    }
  };
  collectNodes(schema.nodes);

  // 反向邻接表：targetNodeID → [sourceNodeID, ...]
  const reverseAdj = new Map<string, string[]>();
  for (const edge of schema.edges) {
    const sources = reverseAdj.get(edge.targetNodeID) ?? [];
    sources.push(edge.sourceNodeID);
    reverseAdj.set(edge.targetNodeID, sources);
  }

  // BFS 反向遍历
  const visited = new Set<string>([currentNodeId]);
  const queue = [currentNodeId];
  const upstreamIds = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const sources = reverseAdj.get(current) ?? [];
    for (const src of sources) {
      if (visited.has(src)) continue;
      visited.add(src);
      upstreamIds.add(src);
      queue.push(src);
    }
  }

  // 过滤掉 block 类型节点，返回实际业务节点
  return [...upstreamIds]
    .map((id) => nodeMap.get(id))
    .filter((n): n is WorkflowNode => n != null && n.type !== 'block');
}

/**
 * 从 assign 节点的 data 中提取全局变量名。
 * assign 节点的 data.variableName 是写入 global 的变量名。
 */
function extractAssignVariables(node: WorkflowNode): string[] {
  if (node.type !== 'assign' && node.type !== 'assign' && node.type !== 'Assign') return [];
  const varName = node.data?.['variableName'] as string | undefined;
  return varName ? [varName] : [];
}

/**
 * 从 object_operation 节点的 data 中提取 resultVariable。
 */
function extractQueryVariables(node: WorkflowNode): string[] {
  if (node.type !== 'object_operation' && node.type !== 'objectOperation') return [];
  const resultVar = (node.data?.['resultVariable'] as string | undefined) ??
    (node.data?.['result_variable'] as string | undefined);
  return resultVar ? [resultVar] : [];
}

/**
 * 解析当前节点可用的所有变量，返回扁平化选项列表。
 *
 * @param schema 流程 Schema
 * @param currentNodeId 当前条件节点的 ID
 * @returns 变量选项列表，value 为字段名（直接可用于表达式）
 */
export function resolveVariables(
  schema: WorkflowSchema | undefined,
  currentNodeId: string | undefined,
): VariableOption[] {
  if (!schema || !currentNodeId) return [];

  const upstreamNodes = findUpstreamNodes(schema, currentNodeId);
  const options: VariableOption[] = [];
  const seenFields = new Set<string>();

  // 1. 全局变量（从 assign 和 object_operation 节点解析）
  for (const node of upstreamNodes) {
    const assignVars = extractAssignVariables(node);
    const queryVars = extractQueryVariables(node);
    for (const varName of [...assignVars, ...queryVars]) {
      if (!seenFields.has(varName)) {
        seenFields.add(varName);
        options.push({
          value: varName,
          label: `${varName}`,
          sourceNode: node.data?.['title'] as string | undefined,
          type: 'any',
        });
      }
    }
  }

  // 2. 上游节点输出变量（扁平化）
  for (const node of upstreamNodes) {
    const outputFields = NODE_OUTPUT_SCHEMA[node.type];
    if (!outputFields) continue;

    const nodeTitle = (node.data?.['title'] as string | undefined) ?? node.id;

    for (const field of outputFields) {
      if (!seenFields.has(field.field)) {
        seenFields.add(field.field);
        options.push({
          value: field.field,
          label: `${field.label} (${field.field})`,
          sourceNode: nodeTitle,
          type: field.type,
        });
      }
    }
  }

  return options;
}
