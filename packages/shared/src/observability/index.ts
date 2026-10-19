/**
 * 观测域（P1 运维治理）— 事件分类 SSOT + 审计动作分类映射。
 *
 * 前后端共享的分类合同：gateway 落库校验、studio 观测中心/审计页筛选、
 * runtime-ui 报错上报都引用此处常量，禁止各端私自硬编码。
 */

// ---------------------------------------------------------------------------
// 观测事件分类
// ---------------------------------------------------------------------------

/** 观测事件分类（ObservabilityEvent.category 值域）。 */
export const EVENT_CATEGORIES = [
  'FUNCTION_EXEC', // 云函数执行
  'SLOW_QUERY', // 慢查询
  'PAGE_ERROR', // 页面报错（前端渲染异常上报）
  'OPEN_API_CALL', // 开放 API 调用
  'AI_GENERATION', // AI 生成遥测（ADR-0004 决策 5：MCP 提交/G3 拦截/审批结果）
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** 观测事件级别（ObservabilityEvent.level 值域）。 */
export const EVENT_LEVELS = ['INFO', 'WARN', 'ERROR'] as const;

export type EventLevel = (typeof EVENT_LEVELS)[number];

/** 事件分类中文名（观测中心页签/筛选直接消费）。 */
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  FUNCTION_EXEC: '云函数执行',
  SLOW_QUERY: '慢查询',
  PAGE_ERROR: '页面报错',
  OPEN_API_CALL: '开放 API 调用',
  AI_GENERATION: 'AI 生成',
};

/** 事件级别中文名。 */
export const EVENT_LEVEL_LABELS: Record<EventLevel, string> = {
  INFO: '信息',
  WARN: '警告',
  ERROR: '错误',
};

// ---------------------------------------------------------------------------
// 审计动作分类（审计日志对齐观测分类）
// ---------------------------------------------------------------------------

/** 审计分类（审计日志按动作归类后的口径，语义对齐观测分类体系）。 */
export const AUDIT_CATEGORIES = [
  'APP', // 应用生命周期（发布/部署/环境变量）
  'GOVERNANCE', // 治理轨道（MCP 出稿 / 审核流转 / 服务身份）
  'PROCESS', // 流程（发布 / API 触发）
  'RECORD', // 数据记录（增删改）
  'ACCESS', // 访问与权限（权限检查 / 拒绝）
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** 审计分类中文名。 */
export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  APP: '应用生命周期',
  GOVERNANCE: '治理轨道',
  PROCESS: '流程',
  RECORD: '数据记录',
  ACCESS: '访问与权限',
};

/** 审计动作 → 分类 SSOT 映射（gateway 全部 writeAudit/AuditLogService 动作）。 */
export const AUDIT_ACTION_CATEGORIES: Record<string, AuditCategory> = {
  // 应用生命周期
  APP_PUBLISH: 'APP',
  ENV_DEPLOY: 'APP',
  ENV_ROLLBACK: 'APP',
  ENV_VAR_SET: 'APP',
  ENV_VAR_DEF_CREATE: 'APP',
  ENV_VAR_DEF_DELETE: 'APP',
  // 治理轨道
  MCP_DRAFT_SUBMIT: 'GOVERNANCE',
  REVIEW_SUBMIT: 'GOVERNANCE',
  REVIEW_APPROVE: 'GOVERNANCE',
  REVIEW_REJECT: 'GOVERNANCE',
  REVIEW_DISCARD: 'GOVERNANCE',
  SERVICE_IDENTITY_CREATE: 'GOVERNANCE',
  SERVICE_IDENTITY_REVOKE: 'GOVERNANCE',
  // 流程
  PROCESS_PUBLISH: 'PROCESS',
  PROCESS_API_RELEASE: 'PROCESS',
  PROCESS_API_START: 'PROCESS',
  // 数据记录
  RECORD_CREATE: 'RECORD',
  RECORD_UPDATE: 'RECORD',
  RECORD_DELETE: 'RECORD',
  // 访问与权限
  PERMISSION_CHECK: 'ACCESS',
  PERMISSION_DENIED: 'ACCESS',
  // 应用归属（ADR-0005）：成员增删 / 所有权转移
  APP_MEMBER_ADD: 'ACCESS',
  APP_MEMBER_REMOVE: 'ACCESS',
  APP_OWNER_TRANSFER: 'ACCESS',
};

/** 按分类反查动作列表（审计查询端点把 category 过滤展开为 action IN）。 */
export function actionsByCategory(category: AuditCategory): string[] {
  return Object.entries(AUDIT_ACTION_CATEGORIES)
    .filter(([, c]) => c === category)
    .map(([action]) => action);
}

/** 审计动作的分类（未登记动作归 OTHER，前端显示"其他"）。 */
export const AUDIT_CATEGORY_OTHER = 'OTHER' as const;

export function categoryOfAuditAction(action: string): AuditCategory | typeof AUDIT_CATEGORY_OTHER {
  return AUDIT_ACTION_CATEGORIES[action] ?? AUDIT_CATEGORY_OTHER;
}
