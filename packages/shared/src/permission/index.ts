/**
 * 权限与多租户 类型契约 —— Phase 4。
 *
 * RBAC + ABAC 混合模型：角色判定有无权限(RBAC)，条件表达式过滤可见数据(ABAC)。
 * 五级权限：页面 / 记录(行级) / 流程 / 数据模型(对象+字段级) / 连接器。
 *
 * @see docs/prd/PRD-permission.md
 */

import type { AppId, ISODateString, RoleId, TenantId, UserId } from '../common/index.js';

// ---------------------------------------------------------------------------
// 角色
// ---------------------------------------------------------------------------

/** 角色。可绑定到应用（应用级角色），appId 为空则为租户级角色。 */
export interface Role {
  id: RoleId;
  tenantId: TenantId;
  /** 所属应用 ID（为空表示租户级角色，如系统管理员） */
  appId?: AppId;
  name: string;
  /** 角色编码，如 ADMIN / BUILDER / END_USER */
  code: string;
  description?: string;
  /** 是否内置角色（不可删除） */
  isBuiltIn: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 用户-角色绑定。 */
export interface UserRole {
  userId: UserId;
  roleId: RoleId;
  assignedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// 组织架构
// ---------------------------------------------------------------------------

/** 组织节点类型。 */
export type OrgNodeType = 'DEPARTMENT' | 'TEAM' | 'POSITION';

/** 组织节点（树形）。 */
export interface OrgNode {
  id: string;
  tenantId: TenantId;
  parentId?: string;
  name: string;
  /** 节点编码（租户内唯一） */
  code: string;
  /** 节点类型：部门 / 团队 / 岗位 */
  nodeType: OrgNodeType;
  /** 排序序号 */
  sort: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** 子节点（树形展开时填充） */
  children?: OrgNode[];
  /** 直接成员 */
  members?: OrgMember[];
}

/** 组织成员关联。 */
export interface OrgMember {
  userId: UserId;
  orgId: string;
  joinedAt: ISODateString;
}

/** 组织角色授权 — 将角色授权给组织节点，节点下所有成员自动获得该角色。 */
export interface OrgRoleGrant {
  id: string;
  tenantId: TenantId;
  orgId: string;
  roleId: RoleId;
  appId?: AppId;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// 五级权限
// ---------------------------------------------------------------------------

/** 权限类型（五级权限）。 */
export enum PermissionType {
  /** 页面权限 */
  Page = 'PAGE',
  /** 记录权限（行级） */
  Record = 'RECORD',
  /** 流程权限 */
  Process = 'PROCESS',
  /** 数据模型权限（对象 + 字段级） */
  DataModel = 'DATA_MODEL',
  /** 连接器/函数权限 */
  Connector = 'CONNECTOR',
}

/** 权限动作。 */
export enum PermissionAction {
  View = 'VIEW',
  Create = 'CREATE',
  Edit = 'EDIT',
  Delete = 'DELETE',
  Execute = 'EXECUTE',
  /** 流程审批 */
  Approve = 'APPROVE',
  /** 管理权限（增删改配置） */
  Manage = 'MANAGE',
}

/** 权限效果。 */
export enum PermissionEffect {
  Allow = 'ALLOW',
  Deny = 'DENY',
}

/** 权限规则 — 声明某角色对某资源有何动作权限，是否附带行级条件。 */
export interface PermissionRule {
  id: string;
  tenantId: TenantId;
  appId?: AppId;
  roleId: RoleId;
  /** 权限维度 */
  type: PermissionType;
  /** 权限动作 */
  action: PermissionAction;
  /** 作用目标 ID（页面ID / 对象ID / 流程定义ID / 连接器ID） */
  targetId: string;
  /** 流程节点 ID（仅 PROCESS:APPROVE 用） */
  targetNodeId?: string;
  /** 行级条件（JsonLogic JSON，仅 RECORD 类型用），null=无条件 */
  condition?: object | null;
  /** 字段级白名单（仅 DATA_MODEL 类型用），null=全部字段 */
  fieldScope?: string[] | null;
  /** 权限效果 */
  effect: PermissionEffect;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// API 请求/响应 DTO
// ---------------------------------------------------------------------------

/** 创建角色请求。 */
export interface CreateRoleRequest {
  name: string;
  code: string;
  description?: string;
  appId?: AppId;
}

/** 更新角色请求。 */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

/** 创建权限规则请求。 */
export interface CreatePermissionRuleRequest {
  roleId: RoleId;
  type: PermissionType;
  action: PermissionAction;
  targetId: string;
  targetNodeId?: string;
  /** 行级条件（JsonLogic JSON），null=无条件 */
  condition?: object | null;
  fieldScope?: string[] | null;
  effect?: PermissionEffect;
  appId?: AppId;
}

/** 创建组织节点请求。 */
export interface CreateOrgNodeRequest {
  parentId?: string;
  name: string;
  code: string;
  nodeType?: OrgNodeType;
  sort?: number;
}

/** 更新组织节点请求。 */
export interface UpdateOrgNodeRequest {
  name?: string;
  sort?: number;
  parentId?: string;
}
