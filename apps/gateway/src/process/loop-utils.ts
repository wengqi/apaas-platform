/**
 * 循环节点图分析工具 — loop / break / continue 执行器共用。
 *
 * 循环体用扁平边表达：循环节点的"体边"指向体内首节点，体内末节点连回循环节点（成环）；
 * "完成边"指向循环后的下游（不回到循环节点）。
 * 体/完成边通过可达性自动分类，无需约定边 label。
 */

import type { WorkflowSchema } from '@apaas/shared';

/** 从 startId 沿扁平边 BFS，判断能否到达 targetId。 */
export function canReach(schema: WorkflowSchema, startId: string, targetId: string): boolean {
  if (startId === targetId) return true;
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const edge of schema.edges) {
      if (edge.sourceNodeID !== current) continue;
      if (edge.targetNodeID === targetId) return true;
      if (visited.has(edge.targetNodeID)) continue;
      visited.add(edge.targetNodeID);
      queue.push(edge.targetNodeID);
    }
  }
  return false;
}

/**
 * 分类循环节点的出边。
 * - 体边：目标节点可沿边回到循环节点（成环）
 * - 完成边：其余出边
 *
 * Schema 未成环时兜底：首条出边视为体边，其余为完成边。
 */
export function classifyLoopEdges(
  schema: WorkflowSchema,
  loopNodeId: string,
): { bodyTargets: string[]; doneTargets: string[] } {
  const bodyTargets: string[] = [];
  const doneTargets: string[] = [];
  for (const edge of schema.edges) {
    if (edge.sourceNodeID !== loopNodeId) continue;
    if (canReach(schema, edge.targetNodeID, loopNodeId)) {
      bodyTargets.push(edge.targetNodeID);
    } else {
      doneTargets.push(edge.targetNodeID);
    }
  }
  if (bodyTargets.length === 0 && doneTargets.length > 1) {
    const first = doneTargets.shift();
    if (first) bodyTargets.push(first);
  }
  return { bodyTargets, doneTargets };
}

/**
 * 查找包含 fromNodeId 的循环，按"循环节点到 fromNode 的 BFS 距离"升序（内层循环优先）。
 *
 * 归属判定：fromNode 可从循环体边到达（属于循环体）；
 * requireBackReach 为 true 时（continue 节点）还要求 fromNode 能沿边回到循环节点
 * （break 节点的出边直接离开循环体，故不要求回边）。
 */
export function findEnclosingLoops(
  schema: WorkflowSchema,
  fromNodeId: string,
  requireBackReach: boolean,
): string[] {
  const candidates: Array<{ id: string; distance: number }> = [];
  for (const node of schema.nodes) {
    if (node.type !== 'loop') continue;
    const { bodyTargets } = classifyLoopEdges(schema, node.id);
    const inBody = bodyTargets.some((t) => canReach(schema, t, fromNodeId));
    if (!inBody) continue;
    if (requireBackReach && !canReach(schema, fromNodeId, node.id)) continue;
    candidates.push({ id: node.id, distance: bfsDistance(schema, node.id, fromNodeId) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.map((c) => c.id);
}

/** BFS 求起点到目标的边数距离（不可达返回 Infinity）。 */
function bfsDistance(schema: WorkflowSchema, startId: string, targetId: string): number {
  if (startId === targetId) return 0;
  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const edge of schema.edges) {
      if (edge.sourceNodeID !== current.id) continue;
      if (edge.targetNodeID === targetId) return current.depth + 1;
      if (visited.has(edge.targetNodeID)) continue;
      visited.add(edge.targetNodeID);
      queue.push({ id: edge.targetNodeID, depth: current.depth + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}
