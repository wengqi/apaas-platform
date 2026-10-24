/**
 * 流程节点配置完整性检查（跨端 SSOT）—— AI/画布双轨一致。
 *
 * studio 画布"有未完成的配置"标红与 gateway 发布预检消费同一份判定——
 * 消除"前端标红但发布照样通过"的双轨不一致（用户反馈 2026-10-06）。
 * data 形态为节点 data 原样（引擎/画布两侧字段名一致，snake_case 为主）。
 */

/** 节点配置完整性问题（含中文原因，可直接展示）。 */
export interface NodeIncompleteIssue {
  nodeId: string;
  nodeType: string;
  /** 节点标题（缺失时回退类型名） */
  nodeTitle: string;
  reason: string;
}

/** 单节点是否配置不完整（true=不完整）。判定与画布标红口径一致。 */
export function isNodeIncomplete(type: string, data: Record<string, unknown>): boolean {
  switch (type) {
    case 'trigger':
      return !data['triggerType'];
    case 'userTask':
    case 'user_task': {
      // 审批人（单值/角色数组/多人数组任一）+ 审批模式都有值才算完成；
      // INITIATOR（发起人审批，专题 R1-A1）免填审批人
      const hasAssignee =
        data['assignee'] ||
        data['assigneeId'] ||
        data['assigneeType'] === 'INITIATOR' ||
        (Array.isArray(data['candidateGroups']) &&
          (data['candidateGroups'] as unknown[]).length > 0) ||
        (Array.isArray(data['approveUsers']) && (data['approveUsers'] as unknown[]).length > 0);
      return !hasAssignee || !data['approvalMode'];
    }
    case 'notification':
      // recipients 为数组（实机字段名；旧判定误用单数 recipient 导致
      // 已配置的通知节点永远标红——用户反馈截图即此误报）
      return (
        !data['channel'] ||
        !(Array.isArray(data['recipients']) && (data['recipients'] as unknown[]).length > 0)
      );
    case 'objectOperation':
    case 'object_operation':
      return !data['operation'] || !data['objectId'];
    case 'httpRequest':
    case 'http_request':
      return !data['method'] || !data['url'];
    case 'delay':
      return !data['duration'];
    case 'loop':
      return !data['collection'];
    case 'wait_for_condition':
      return !data['condition'];
    case 'sub_process':
      return !data['subProcessKey'] && !data['subProcessDefId'];
    case 'batch_operation':
      return !data['operation'] || !data['objectId'];
    case 'start':
    case 'end':
    case 'assign':
    case 'parallel':
    case 'inclusive':
    case 'break':
    case 'continue':
    case 'block':
      return false;
    default:
      return false;
  }
}

/** 不完整原因（中文，供发布预检错误与检查报告直出）。 */
export function nodeIncompleteReason(type: string): string {
  switch (type) {
    case 'trigger':
      return '触发器未配置触发类型';
    case 'userTask':
    case 'user_task':
      return '审批人或审批模式未配置';
    case 'notification':
      return '通知渠道或收件人未配置';
    case 'objectOperation':
    case 'object_operation':
    case 'batch_operation':
      return '操作类型或目标对象未配置';
    case 'httpRequest':
    case 'http_request':
      return '请求方法或 URL 未配置';
    case 'delay':
      return '延时时长未配置';
    case 'loop':
      return '循环集合未配置';
    case 'wait_for_condition':
      return '等待条件未配置';
    case 'sub_process':
      return '子流程未选择';
    default:
      return '配置不完整';
  }
}

/** 递归收集（含 blocks 嵌套）整图节点配置完整性问题。 */
export function collectNodeIssues(
  nodes: Array<Record<string, unknown>>,
  issues: NodeIncompleteIssue[] = [],
): NodeIncompleteIssue[] {
  for (const n of nodes) {
    const type = String(n['type'] ?? '');
    const data = (n['data'] ?? {}) as Record<string, unknown>;
    if (isNodeIncomplete(type, data)) {
      issues.push({
        nodeId: String(n['id'] ?? ''),
        nodeType: type,
        nodeTitle: String(data['title'] ?? type),
        reason: nodeIncompleteReason(type),
      });
    }
    const blocks = n['blocks'];
    if (Array.isArray(blocks)) {
      collectNodeIssues(blocks as Array<Record<string, unknown>>, issues);
    }
  }
  return issues;
}

/** S2 error 出边歧义（P1-15）：同一节点的归一化 error/失败 出边多于一条时无法判定路由。 */
export interface ErrorEdgeConflictIssue {
  sourceNodeId: string;
  /** 冲突的 error 边目标节点 */
  conflictingTargets: string[];
  severity: 'error';
}

/** error 出边的归一口径（与引擎侧路由匹配同源：trim + 小写；中文「失败」单独判等）。 */
export function isErrorEdgeLabel(label: string | undefined): boolean {
  if (!label) return false;
  const trimmed = label.trim();
  return trimmed.toLowerCase() === 'error' || trimmed === '失败';
}

/**
 * 收集 error 出边歧义（P1-15）：双 error 边在引擎侧按首条路由，语义不可预期——
 * 发布硬闸与「检查」按钮消费本函数以 error 级拦截，强制搭建者改到唯一。
 */
export function collectErrorEdgeConflicts(
  edges: Array<{ sourceNodeID: string; targetNodeID: string; label?: string }>,
): ErrorEdgeConflictIssue[] {
  const bySource = new Map<string, string[]>();
  for (const e of edges) {
    if (!isErrorEdgeLabel(e.label)) continue;
    const bucket = bySource.get(e.sourceNodeID) ?? [];
    bucket.push(e.targetNodeID);
    bySource.set(e.sourceNodeID, bucket);
  }
  const issues: ErrorEdgeConflictIssue[] = [];
  for (const [sourceNodeId, targets] of bySource) {
    if (targets.length > 1) {
      issues.push({ sourceNodeId, conflictingTargets: targets, severity: 'error' });
    }
  }
  return issues;
}
