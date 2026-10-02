/**
 * 权限查询调试 API（P1 运维治理）— POST /api/permissions/debug。
 *
 * 回答"用户 X 对目标 Y 能否执行 Z、为什么"：有效角色、命中规则、
 * deny-overrides 结论、合并条件与翻译后的 Prisma where、记录可见性验证。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';
import type { PermissionType, PermissionAction, PermissionEffect } from './permissions.js';

/** 命中的权限规则（explain 返回的投影）。 */
export interface MatchedRule {
  ruleId: string;
  roleId: string;
  effect: PermissionEffect;
  targetId: string;
  condition: unknown;
  fieldScope: string[] | null;
}

/** 决策原因（deny-overrides 解释）。 */
export type PermissionDebugReason =
  'SUPERADMIN' | 'ALLOW_RULE' | 'NO_ROLES' | 'DENY_RULE' | 'NO_RULES';

/** 记录可见性验证结果（请求带 recordId 时返回）。 */
export interface RecordCheck {
  found: boolean;
  visible: boolean;
}

export interface PermissionDebugResult {
  allowed: boolean;
  reason: PermissionDebugReason;
  roleIds: string[];
  matchedRules: MatchedRule[];
  /** 合并后的行级 JsonLogic 条件，null=无限制 */
  mergedCondition: unknown;
  fieldScope: string[] | null;
  /** 翻译后的 Prisma where，null=无限制 */
  translatedWhere: unknown;
  translateError: string | null;
  recordCheck: RecordCheck | null;
}

export interface PermissionDebugRequest {
  userId: string;
  type: PermissionType;
  action: PermissionAction;
  targetId: string;
  targetNodeId?: string;
  recordId?: string;
}

const unwrap = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((res) => res.data.data as T);

export const permissionDebugApi = {
  /** 权限决策解释（只读调试，不落审计）。 */
  debug: (body: PermissionDebugRequest) =>
    unwrap<PermissionDebugResult>(client.post('/api/permissions/debug', body)),
};
