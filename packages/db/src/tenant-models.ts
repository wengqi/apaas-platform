/**
 * 租户作用域模型白名单 — 有 tenantId 列的 Prisma 模型集合。
 *
 * 扩展自动注入 tenantId 到这些模型的查询 where/data 中。
 *
 * 排除的 5 个模型（无 tenantId 列）：
 * - Tenant: 租户实体本身
 * - UserRole: 关联表，通过 Role.tenantId 间接隔离
 * - OrgMember: 关联表，通过 OrgNode.tenantId 间接隔离
 * - View: 子表，通过 objectId → ObjectMeta 间接隔离
 * - NodeExecution: 子表，通过 instanceId → ProcessInstance 间接隔离
 */

export const TENANT_SCOPED_MODELS = new Set<string>([
  'Application',
  'User',
  'Role',
  'OrgNode',
  'PermissionRule',
  'OrgRoleGrant',
  'AuditLog',
  'ObjectMeta',
  'Record',
  'PageMeta',
  'ProcessDef',
  'ProcessInstance',
  'ProcessTask',
  'NotificationTemplate',
  'InAppMessage',
  'AppVersion',
  'ResourceVersion',
  'ChangeLog',
  'AppCheck',
  'AppEnvironment',
  'Deployment',
  'EnvVarDef',
  'EnvVarValue',
  'ServiceIdentity',
  'ProcessApiRelease',
  'Connector',
  'ConnectorCredential',
  'DataFlow',
  'Dataset',
  'DatasetRow',
  'CloudFunction',
  'ObservabilityEvent',
]);

/**
 * 环境作用域模型白名单（R1.4 多环境）— 有 environmentId 列（值域 'dev'|'prod'），
 * 且数据按环境隔离的运行时模型。ALS 环境上下文非空时 $extends 自动注入
 * where/data.environmentId；未指定环境时不注入（兼容无环境概念的既有路径）。
 */
export const ENV_SCOPED_MODELS = new Set<string>([
  'Record',
  'ProcessInstance',
  'NodeExecution',
  'AutoNumberCounter',
  'ObservabilityEvent',
]);
