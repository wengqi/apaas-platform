/**
 * 租户内置角色权限规则 SSOT（2026-10-18）。
 *
 * seed（demo 租户）与 TenantService.initBuiltInRoles（租户管理页新建租户）共同消费
 * 本文件——两处此前各写一份并已实际漂移：
 * - 2026-10-04 数据流执行修复（BUILDER 需 DATA_MODEL:EXECUTE）只补了 seed；
 * - 2026-10-10 任务中心修复（END_USER 需 PROCESS:VIEW，规约：运行时角色必含 VIEW）只补了 seed；
 * - BUILDER 的 CONNECTOR×5 仅存在于 seed。
 * 导致经「租户管理」新建的租户中，BUILDER 连接器页 403 / 无法执行数据流，
 * END_USER 任务中心 403 被渲染成空表（TC-170 同款缺陷复发）。改为单一来源防再漂移。
 *
 * ⚠️ 本文件必须保持运行时零依赖：index.ts 对本模块是 `export *`（ESM 提升先于
 * 枚举 IIFE 初始化），此处若以值导入引用 index 的枚举会触发循环初始化
 * （PermissionType undefined）。故仅 type-only 导入 + 字符串字面量，
 * 字面量合法性由模板字面量联合类型在编译期校验。
 */

import type { PermissionAction, PermissionType } from './index.js';

/** 内置角色权限规则（写入方统一附加 targetId='*' + effect='ALLOW'）。 */
export interface BuiltinRoleRule {
  type: `${PermissionType}`;
  action: `${PermissionAction}`;
}

/** BUILDER — 应用搭建者（24 条）。 */
export const BUILDER_RULES: BuiltinRoleRule[] = [
  { type: 'PAGE', action: 'MANAGE' },
  { type: 'PAGE', action: 'CREATE' },
  { type: 'PAGE', action: 'EDIT' },
  { type: 'PAGE', action: 'DELETE' },
  { type: 'PAGE', action: 'VIEW' },
  { type: 'DATA_MODEL', action: 'CREATE' },
  { type: 'DATA_MODEL', action: 'EDIT' },
  { type: 'DATA_MODEL', action: 'DELETE' },
  { type: 'DATA_MODEL', action: 'VIEW' },
  { type: 'DATA_MODEL', action: 'EXECUTE' },
  { type: 'PROCESS', action: 'CREATE' },
  { type: 'PROCESS', action: 'EDIT' },
  { type: 'PROCESS', action: 'DELETE' },
  { type: 'PROCESS', action: 'EXECUTE' },
  { type: 'PROCESS', action: 'VIEW' },
  { type: 'RECORD', action: 'CREATE' },
  { type: 'RECORD', action: 'EDIT' },
  { type: 'RECORD', action: 'DELETE' },
  { type: 'RECORD', action: 'VIEW' },
  { type: 'CONNECTOR', action: 'CREATE' },
  { type: 'CONNECTOR', action: 'EDIT' },
  { type: 'CONNECTOR', action: 'DELETE' },
  { type: 'CONNECTOR', action: 'VIEW' },
  { type: 'CONNECTOR', action: 'EXECUTE' },
];

/** END_USER — 终端用户（6 条，主战场为运行时门户）。 */
export const END_USER_RULES: BuiltinRoleRule[] = [
  { type: 'PAGE', action: 'VIEW' },
  { type: 'RECORD', action: 'CREATE' },
  { type: 'RECORD', action: 'VIEW' },
  { type: 'PROCESS', action: 'VIEW' },
  { type: 'PROCESS', action: 'EXECUTE' },
  { type: 'PROCESS', action: 'APPROVE' },
];

/** 租户普通成员是否具备搭建器（studio）访问权：仅平台超管/租户管理员/搭建者。 */
export function hasStudioAccess(isPlatformAdmin: boolean, roleCodes: readonly string[]): boolean {
  if (isPlatformAdmin) return true;
  return roleCodes.includes('TENANT_ADMIN') || roleCodes.includes('BUILDER');
}
