/**
 * 权限与多租户 类型契约 —— Phase 4 详细定义。
 * 此处为基础骨架，确保 shared 包可编译。
 *
 * @see docs/prd/PRD-permission.md  产品需求（待 Phase 4 产品闸门产出）
 */

import type { AppId, ISODateString, RoleId, TenantId } from '../common/index.js';

/** 角色。可绑定到应用（应用级角色），appId 为空则为租户级角色。 */
export interface Role {
  id: RoleId;
  tenantId: TenantId;
  /** 所属应用 ID（为空表示租户级角色，如系统管理员） */
  appId?: AppId;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 组织节点（树形）。 */
export interface OrgNode {
  id: string;
  tenantId: TenantId;
  parentId?: string;
  name: string;
  /** 节点类型：部门 / 团队 / 岗位 */
  nodeType: 'department' | 'team' | 'position';
  sortOrder: number;
  children?: OrgNode[];
}

/** 权限类型（五级权限）。 */
export enum PermissionType {
  /** 页面权限 */
  Page = 'page',
  /** 记录权限（行级） */
  Record = 'record',
  /** 流程权限 */
  Process = 'process',
  /** 数据模型权限（对象 + 字段级） */
  DataModel = 'data_model',
  /** 连接器/函数权限 */
  Connector = 'connector',
}

/** 权限规则。 */
export interface PermissionRule {
  type: PermissionType;
  /** 权限动作 */
  action: PermissionAction;
  /** 作用目标 ID */
  targetId: string;
  /** 条件表达式（记录级权限，为空则无条件） */
  condition?: string;
}

export enum PermissionAction {
  View = 'view',
  Create = 'create',
  Edit = 'edit',
  Delete = 'delete',
  Execute = 'execute',
  Manage = 'manage',
}
