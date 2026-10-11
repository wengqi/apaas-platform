/**
 * WorkflowSchema 校验器（G3）。
 *
 * 校验流程定义的结构与节点配置合法性：
 * - 图结构：start/end 存在性、边引用有效节点、节点数预算、不可达节点警告
 * - 节点类型白名单（20 执行器）
 * - user_task 审批配置（R1.3 语义）：approvalMode 枚举、多模式 approveUsers
 *   非空、single 需受理人、pageId/rejectToNodeId 引用（提供 ctx 时校验存在性）
 * - 边条件：可解析的 JsonLogic JSON
 */

import type { SchemaIssue } from '@apaas/shared';
import { SCHEMA_ISSUE_CODES } from '@apaas/shared';
import type { UserTaskConfig } from '@apaas/shared';

/** 节点类型白名单 = 引擎注册的 20 个执行器。 */
const NODE_TYPES: ReadonlySet<string> = new Set([
  'start',
  'end',
  'trigger',
  'assign',
  'condition',
  'inclusive',
  'parallel',
  'loop',
  'break',
  'continue',
  'wait_for_condition',
  'delay',
  'object_operation',
  'batch_operation',
  'user_task',
  'notification',
  'http_request',
  'sub_process',
  'cloud_function',
  'block',
]);

/** 审批模式枚举（UserTaskConfig.approvalMode）。 */
const APPROVAL_MODES: ReadonlySet<string> = new Set([
  'single',
  'countersign',
  'or_sign',
  'sequential',
]);

/** 节点/边数量预算。 */
const MAX_NODES = 200;
const MAX_EDGES = 400;

/** 跨引用上下文（可选——提供时校验引用存在性，不提供则跳过防误报）。 */
export interface WorkflowValidationContext {
  /** 平台已存在的页面 ID 集（审批页面绑定校验） */
  pageIds?: ReadonlySet<string>;
}

/** 校验 WorkflowSchema。 */
export function validateWorkflow(
  schema: unknown,
  ctx: WorkflowValidationContext = {},
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isPlainObject(schema) || !Array.isArray(schema['nodes'])) {
    issues.push({
      path: '',
      code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
      message: 'WorkflowSchema 必须是含 nodes 数组的对象',
      severity: 'error',
    });
    return issues;
  }
  const nodes = schema['nodes'] as Array<Record<string, unknown>>;
  const edges = Array.isArray(schema['edges'])
    ? (schema['edges'] as Array<Record<string, unknown>>)
    : [];

  if (nodes.length === 0) {
    issues.push({
      path: 'nodes',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '流程至少需要一个节点',
      severity: 'error',
    });
  }
  if (nodes.length > MAX_NODES) {
    issues.push({
      path: 'nodes',
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `节点数超过上限 ${MAX_NODES}`,
      severity: 'error',
    });
  }
  if (edges.length > MAX_EDGES) {
    issues.push({
      path: 'edges',
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `边数超过上限 ${MAX_EDGES}`,
      severity: 'error',
    });
  }

  const nodeIds = new Set<string>();
  const nodeById = new Map<string, Record<string, unknown>>();
  for (const [idx, n] of nodes.entries()) {
    const id = typeof n['id'] === 'string' ? n['id'] : '';
    const type = typeof n['type'] === 'string' ? n['type'] : '';
    if (!id) {
      issues.push({
        path: `nodes/${idx}/id`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: '节点缺少 id',
        severity: 'error',
      });
      continue;
    }
    if (nodeIds.has(id)) {
      issues.push({
        path: `nodes/${idx}/id`,
        code: SCHEMA_ISSUE_CODES.DUPLICATE_KEY,
        message: `节点 id "${id}" 重复`,
        severity: 'error',
      });
      continue;
    }
    nodeIds.add(id);
    nodeById.set(id, n);

    if (!NODE_TYPES.has(type)) {
      issues.push({
        path: `nodes/${idx}/type`,
        code: SCHEMA_ISSUE_CODES.UNKNOWN_TYPE,
        message: `未知节点类型 "${type}"（引擎支持 20 种：start/end/trigger/assign/condition/inclusive/parallel/loop/break/continue/wait_for_condition/delay/object_operation/batch_operation/user_task/notification/http_request/sub_process/cloud_function/block）`,
        severity: 'error',
      });
    }
  }

  // start/end 存在性
  const hasStart = nodes.some((n) => n['type'] === 'start');
  const hasEnd = nodes.some((n) => n['type'] === 'end');
  if (nodes.length > 0 && !hasStart) {
    issues.push({
      path: 'nodes',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '流程缺少 start 节点',
      severity: 'error',
    });
  }
  if (nodes.length > 0 && !hasEnd) {
    issues.push({
      path: 'nodes',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '流程缺少 end 节点',
      severity: 'error',
    });
  }

  // 边引用 + 条件可解析
  for (const [idx, e] of edges.entries()) {
    const src = typeof e['sourceNodeID'] === 'string' ? e['sourceNodeID'] : '';
    const dst = typeof e['targetNodeID'] === 'string' ? e['targetNodeID'] : '';
    if (!src || !nodeIds.has(src)) {
      issues.push({
        path: `edges/${idx}/sourceNodeID`,
        code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
        message: `边的起点 "${src || '(空)'}" 不是已定义的节点`,
        severity: 'error',
      });
    }
    if (!dst || !nodeIds.has(dst)) {
      issues.push({
        path: `edges/${idx}/targetNodeID`,
        code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
        message: `边的终点 "${dst || '(空)'}" 不是已定义的节点（幽灵边会导致无条件放行到不存在的节点）`,
        severity: 'error',
      });
    }
    const cond = e['condition'];
    if (typeof cond === 'string' && cond.length > 0) {
      try {
        const parsed: unknown = JSON.parse(cond);
        if (!isPlainObject(parsed)) {
          issues.push({
            path: `edges/${idx}/condition`,
            code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
            message: '边条件必须是 JsonLogic JSON 对象',
            severity: 'error',
          });
        }
      } catch {
        issues.push({
          path: `edges/${idx}/condition`,
          code: SCHEMA_ISSUE_CODES.JSON_PARSE,
          message: `边条件不是合法 JSON：${cond.slice(0, 60)}`,
          severity: 'error',
        });
      }
    }
  }

  // 逐节点配置校验
  for (const [idx, n] of nodes.entries()) {
    const data = isPlainObject(n['data']) ? (n['data'] as Record<string, unknown>) : {};
    const nPath = `nodes/${idx}`;
    if (n['type'] === 'user_task') {
      validateUserTask(data, `${nPath}/data`, nodeIds, ctx, issues);
    }
    // 发起页面绑定（R6 方案一）：start.startPageId 与 user_task.pageId 对称，
    // 提供 ctx 时校验页面存在（语义=该流程从此页面发起，纯导航/治理元数据）
    if (n['type'] === 'start') {
      const startPageId = data['startPageId'];
      if (
        typeof startPageId === 'string' &&
        startPageId.length > 0 &&
        ctx.pageIds &&
        !ctx.pageIds.has(startPageId)
      ) {
        issues.push({
          path: `${nPath}/data/startPageId`,
          code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
          message: `发起页面 "${startPageId}" 不存在（startPageId 须为平台已创建页面的 ID）`,
          severity: 'error',
        });
      }
    }
  }

  // 不可达节点（从 start 出发）警告
  const startNode = nodes.find((n) => n['type'] === 'start');
  if (startNode && typeof startNode['id'] === 'string') {
    const reachable = collectReachable(startNode['id'] as string, edges);
    for (const [idx, n] of nodes.entries()) {
      const id = n['id'];
      if (
        typeof id === 'string' &&
        id !== startNode['id'] &&
        !reachable.has(id) &&
        n['type'] !== 'end'
      ) {
        issues.push({
          path: `nodes/${idx}`,
          code: SCHEMA_ISSUE_CODES.ORPHAN_NODE,
          message: `节点 "${id}" 从 start 不可达（孤立节点，运行时永远不会执行）`,
          severity: 'warning',
        });
      }
    }
  }

  return issues;
}

/** user_task 节点配置校验（R1.3 审批语义）。 */
function validateUserTask(
  data: Record<string, unknown>,
  path: string,
  nodeIds: Set<string>,
  ctx: WorkflowValidationContext,
  issues: SchemaIssue[],
): void {
  const cfg = data as unknown as UserTaskConfig;
  // QA 实测（2026-10-03）：搭建器面板写大写枚举（SINGLE/COUNTERSIGN...），
  // 引擎与 seed 用小写——归一化后校验，两侧历史数据零迁移兼容
  const mode = (cfg.approvalMode ?? 'single').toLowerCase();

  if (typeof cfg.taskName !== 'string' || cfg.taskName.length === 0) {
    issues.push({
      path: `${path}/taskName`,
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: 'user_task 缺少 taskName（任务中心展示名）',
      severity: 'error',
    });
  }
  if (!APPROVAL_MODES.has(mode)) {
    issues.push({
      path: `${path}/approvalMode`,
      code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
      message: `approvalMode "${cfg.approvalMode}" 非法，允许值：single/countersign/or_sign/sequential`,
      severity: 'error',
    });
    return;
  }

  const users = cfg.approveUsers ?? [];
  const hasAssignee = typeof cfg.assignee === 'string' && cfg.assignee.length > 0;
  const hasCandidates = Array.isArray(cfg.candidateGroups) && cfg.candidateGroups.length > 0;
  // INITIATOR（发起人审批，专题 R1-A1）：受理人=实例发起人，免填 assignee/candidateGroups
  const isInitiator = String(cfg.assigneeType ?? '').toUpperCase() === 'INITIATOR';

  if (mode === 'single') {
    if (!hasAssignee && !hasCandidates && !isInitiator) {
      issues.push({
        path: `${path}/assignee`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: '单人审批需要 assignee 或 candidateGroups',
        severity: 'error',
      });
    }
  } else {
    if (users.length === 0) {
      issues.push({
        path: `${path}/approveUsers`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message: `审批模式 ${mode} 需要 approveUsers（审批人用户 ID 数组，如 ["user_id_1","user_id_2"]）`,
        severity: 'error',
      });
    } else if (users.some((u) => typeof u !== 'string' || u.length === 0)) {
      issues.push({
        path: `${path}/approveUsers`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: 'approveUsers 必须是非空字符串数组',
        severity: 'error',
      });
    }
  }

  // 审批页面绑定：提供 ctx 时校验页面存在
  if (
    typeof cfg.pageId === 'string' &&
    cfg.pageId.length > 0 &&
    ctx.pageIds &&
    !ctx.pageIds.has(cfg.pageId)
  ) {
    issues.push({
      path: `${path}/pageId`,
      code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
      message: `审批页面 "${cfg.pageId}" 不存在（pageId 须为平台已创建页面的 ID）`,
      severity: 'error',
    });
  }
  // 驳回跳转目标
  if (
    typeof cfg.rejectToNodeId === 'string' &&
    cfg.rejectToNodeId.length > 0 &&
    !nodeIds.has(cfg.rejectToNodeId)
  ) {
    issues.push({
      path: `${path}/rejectToNodeId`,
      code: SCHEMA_ISSUE_CODES.REF_NOT_FOUND,
      message: `驳回跳转目标 "${cfg.rejectToNodeId}" 不是本流程内的节点`,
      severity: 'error',
    });
  }
}

/** 从 start 沿边收集可达节点。 */
function collectReachable(startId: string, edges: Array<Record<string, unknown>>): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const src = e['sourceNodeID'];
    const dst = e['targetNodeID'];
    if (typeof src === 'string' && typeof dst === 'string') {
      const list = adj.get(src) ?? [];
      list.push(dst);
      adj.set(src, list);
    }
  }
  const visited = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return visited;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
