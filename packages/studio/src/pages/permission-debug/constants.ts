/**
 * 权限调试页常量 — 类型/动作选项与决策原因展示元数据。
 *
 * 值域与 gateway permission-debug.dto.ts 的 PERMISSION_TARGET_TYPES /
 * PERMISSION_ACTIONS 对齐（复用 @apaas/shared 权限类型）。
 */

import type { PermissionAction, PermissionType } from '../../api/permissions.js';
import type { PermissionDebugReason } from '../../api/permission-debug.js';

/** 权限类型选项（PermissionRule.type 值域）。 */
export const TARGET_TYPE_OPTIONS: Array<{ value: PermissionType; label: string }> = [
  { value: 'PAGE', label: '页面' },
  { value: 'RECORD', label: '记录' },
  { value: 'PROCESS', label: '流程' },
  { value: 'DATA_MODEL', label: '数据模型' },
  { value: 'CONNECTOR', label: '连接器' },
];

/** 权限动作选项（PermissionRule.action 值域）。 */
export const TARGET_ACTION_OPTIONS: Array<{ value: PermissionAction; label: string }> = [
  { value: 'VIEW', label: '查看' },
  { value: 'CREATE', label: '创建' },
  { value: 'EDIT', label: '编辑' },
  { value: 'DELETE', label: '删除' },
  { value: 'EXECUTE', label: '执行' },
  { value: 'APPROVE', label: '审批' },
  { value: 'MANAGE', label: '管理' },
];

/** 决策原因 → 展示元数据（label + Tag 颜色）。 */
export const REASON_META: Record<PermissionDebugReason, { label: string; color: string }> = {
  SUPERADMIN: { label: '超管短路', color: 'purple' },
  ALLOW_RULE: { label: '规则放行', color: 'green' },
  NO_ROLES: { label: '无角色', color: 'orange' },
  DENY_RULE: { label: '规则拒绝', color: 'red' },
  NO_RULES: { label: '无规则默认拒绝', color: 'red' },
};

/** 规则表 effect → Tag 颜色。 */
export const EFFECT_COLORS: Record<'ALLOW' | 'DENY', string> = {
  ALLOW: 'green',
  DENY: 'red',
};
