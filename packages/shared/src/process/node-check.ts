/**
 * 流程节点配置完整性检查（跨端 SSOT）—— AI/画布双轨一致。
 *
 * studio 画布"有未完成的配置"标红与 gateway 发布预检消费同一份判定——
 * 消除"前端标红但发布照样通过"的双轨不一致（用户反馈 2026-10-06）。
 * data 形态为节点 data 原样（引擎/画布两侧字段名一致，snake_case 为主）。
 */

import { isValidJsonLogicRule } from '../jsonlogic/index.js';

/** 节点配置完整性问题（含中文原因，可直接展示）。 */
export interface NodeIncompleteIssue {
  nodeId: string;
  nodeType: string;
  /** 节点标题（缺失时回退类型名） */
  nodeTitle: string;
  reason: string;
}

/**
 * functional-03：trigger 节点 condition 合法性（isNodeIncomplete 与
 * nodeIncompleteReason 共用）——condition 存在时须为合法 JsonLogic 规则
 * （字符串按 JSON 解析、对象直用；解析失败/非规则节点/超集操作符均判非法，
 * 坏条件到点静默不触发）。返回 true = 非法（视为配置不完整）。
 */
function triggerConditionIssue(data: Record<string, unknown>): boolean {
  const raw = data['condition'];
  if (raw === undefined || raw === null || raw === '') return false;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return true;
    }
  }
  return !isValidJsonLogicRule(parsed);
}

/** 单节点是否配置不完整（true=不完整）。判定与画布标红口径一致。 */
export function isNodeIncomplete(type: string, data: Record<string, unknown>): boolean {
  switch (type) {
    case 'trigger': {
      // R-B functional-09：定时触发必须配 cron（到点注册依赖 cron，缺省 job 无法注册）
      if (data['triggerType'] === 'SCHEDULED' && !data['cron']) return true;
      // R-B functional-03：触发条件须为合法 JsonLogic（D1 子集）——坏条件到点静默不触发
      if (triggerConditionIssue(data)) return true;
      return !data['triggerType'];
    }
    case 'userTask':
    case 'user_task': {
      // R-B functional-02a：AUTO_REJECT 需驳回跳转目标——到点自动驳回无目标时
      // 引擎只能兜底留痕（fail-safe break），预检在源头拦下这个死配置
      if (data['timeoutAction'] === 'AUTO_REJECT' && !data['rejectToNodeId']) return true;
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

/** 不完整原因（中文，供发布预检错误与检查报告直出）。data 供动态专因判定（functional-02a）。 */
export function nodeIncompleteReason(type: string, data?: Record<string, unknown>): string {
  switch (type) {
    case 'trigger':
      if (data?.['triggerType'] === 'SCHEDULED' && !data?.['cron']) {
        return '定时触发未配置 Cron 表达式';
      }
      if (triggerConditionIssue(data ?? {})) {
        return '触发条件表达式非法（须为 JsonLogic JSON，仅限平台支持的操作符）';
      }
      return '触发器未配置触发类型';
    case 'userTask':
    case 'user_task':
      if (data?.['timeoutAction'] === 'AUTO_REJECT' && !data?.['rejectToNodeId']) {
        return '已配置超时自动驳回但未配置驳回跳转节点';
      }
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
        reason: nodeIncompleteReason(type, data),
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

/** PE-08（◆5）：触发环静态分析问题（发布硬闸直出）。 */
export interface TriggerLoopIssue {
  /** 环类型：OBJECT_OP_WRITE=对象操作写回触发对象；WRITEBACK_LOOP=回写×更新触发成环 */
  kind: 'OBJECT_OP_WRITE' | 'WRITEBACK_LOOP';
  /** 触发节点绑定对象 */
  objectId: string;
  message: string;
}

/**
 * 触发环静态分析（PE-08，◆5=预检硬拦）：
 * - 环①：RECORD_* 触发节点绑定对象 X + 本流程 object_operation/batch_operation
 *   节点以 create/update 写同一对象 X——记录→流程→写记录→再触发，无界级联；
 * - 环②：RECORD_UPDATED 触发绑定 X + 任意 user_task 配置了审批回写（writeback
 *   写触发记录）——批准→回写→update 事件→再触发，无限循环。
 * 判定纯静态（画布/发布预检同源直出）。
 */
export function collectTriggerLoopIssues(
  nodes: Array<Record<string, unknown>>,
  issues: TriggerLoopIssue[] = [],
): TriggerLoopIssue[] {
  const trigger = nodes.find((n) => String(n['type'] ?? '') === 'trigger') as
    { data?: Record<string, unknown> } | undefined;
  const td = (trigger?.data ?? {}) as Record<string, unknown>;
  const triggerType = String(td['triggerType'] ?? '');
  const objectId = typeof td['objectId'] === 'string' ? td['objectId'] : undefined;
  if (!objectId || !triggerType.startsWith('RECORD_')) return issues;

  const writesObject = (data: Record<string, unknown>): boolean => {
    const op = String(data['operation'] ?? '');
    return data['objectId'] === objectId && (op === 'create' || op === 'update');
  };
  for (const n of nodes) {
    const type = String(n['type'] ?? '');
    const data = (n['data'] ?? {}) as Record<string, unknown>;
    if (
      (type === 'objectOperation' || type === 'object_operation' || type === 'batch_operation') &&
      writesObject(data)
    ) {
      issues.push({
        kind: 'OBJECT_OP_WRITE',
        objectId,
        message: `触发环：流程由对象 ${objectId} 的记录变更触发，且节点「${String(data['title'] ?? type)}」会写回同一对象——将形成无界级联，请改写其他对象或移除写回`,
      });
    }
    if (
      triggerType === 'RECORD_UPDATED' &&
      (type === 'userTask' || type === 'user_task') &&
      data['writeback'] !== undefined &&
      data['writeback'] !== null
    ) {
      issues.push({
        kind: 'WRITEBACK_LOOP',
        objectId,
        message: `触发环：流程由对象 ${objectId} 的记录更新触发，且节点「${String(data['title'] ?? type)}」配置了审批回写（写回触发记录）——批准后将再次触发本流程，无限循环`,
      });
    }
  }
  return issues;
}
