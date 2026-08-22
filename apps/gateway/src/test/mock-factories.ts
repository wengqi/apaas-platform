/**
 * 测试数据工厂 — 为常用 Prisma 实体生成带合理默认值的 mock 对象。
 *
 * 每个工厂函数接受 Partial<T> 覆盖默认值，减少测试样板代码。
 * 返回的是纯数据对象（非 Prisma 实例），与 Prisma findFirst 返回结构一致。
 */

import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import type { WorkflowSchema } from '@apaas/shared';

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

/** 构造 AuthenticatedUser（默认租户用户，非超管）。 */
export function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'test@example.com',
    roleIds: ['role-001'],
    roleCodes: ['BUILDER'],
    isPlatformAdmin: false,
    isSuperAdmin: false,
    ...overrides,
  };
}

/** 构造超级管理员用户（短路所有权限检查）。 */
export function makeSuperAdmin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return makeUser({
    id: 'admin-001',
    isPlatformAdmin: true,
    isSuperAdmin: true,
    roleIds: [],
    roleCodes: [],
    tenantId: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 租户 & 应用
// ---------------------------------------------------------------------------

export function makeTenant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tenant-001',
    name: 'Test Tenant',
    slug: 'test-tenant',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeApplication(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'app-001',
    tenantId: 'tenant-001',
    name: 'Test App',
    apiName: 'test_app',
    description: 'Test application',
    icon: '📋',
    status: 'DEVELOPMENT',
    namespace: 'test_app',
    createdById: 'user-001',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 对象 & 字段 & 记录
// ---------------------------------------------------------------------------

export function makeObjectMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'obj-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    apiName: 'test_object',
    name: 'Test Object',
    description: 'Test object meta',
    fields: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rec-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    objectId: 'obj-001',
    data: { name: 'Test Record', status: 'active' },
    createdBy: 'user-001',
    updatedBy: 'user-001',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 权限
// ---------------------------------------------------------------------------

export function makeRole(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'role-001',
    tenantId: 'tenant-001',
    name: 'Builder',
    code: 'BUILDER',
    description: 'Builder role',
    isSystem: false,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makePermissionRule(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'rule-001',
    tenantId: 'tenant-001',
    roleId: 'role-001',
    type: 'RECORD',
    action: 'READ',
    targetId: '*',
    effect: 'ALLOW',
    condition: null,
    fieldScope: null,
    targetNodeId: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeUserRole(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ur-001',
    userId: 'user-001',
    roleId: 'role-001',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeOrgMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'om-001',
    userId: 'user-001',
    orgId: 'org-001',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeOrgRoleGrant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'org-001',
    orgId: 'org-001',
    roleId: 'role-002',
    createdAt: new Date('2026-08-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 流程引擎
// ---------------------------------------------------------------------------

export function makeProcessDef(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pd-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    apiName: 'test_process',
    processKey: 'test_process',
    name: 'Test Process',
    workflowSchema: { nodes: [], edges: [] } as WorkflowSchema,
    version: 1,
    status: 'PUBLISHED',
    triggerType: 'RECORD_CREATED',
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeProcessInstance(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'pi-001',
    tenantId: 'tenant-001',
    processDefId: 'pd-001',
    triggerContext: { trigger: 'MANUAL' },
    variables: {},
    status: 'RUNNING',
    activeNodeIds: ['node-start'],
    error: null,
    startedAt: new Date('2026-08-01'),
    finishedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    processDef: makeProcessDef(),
    ...overrides,
  };
}

export function makeNodeExecution(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'ne-001',
    instanceId: 'pi-001',
    nodeId: 'node-001',
    nodeType: 'start',
    status: 'RUNNING',
    output: null,
    error: null,
    startedAt: new Date('2026-08-01'),
    finishedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

export function makeProcessTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task-001',
    instanceId: 'pi-001',
    nodeExecutionId: 'ne-001',
    nodeId: 'node-task',
    taskName: 'Approval Task',
    assigneeId: 'user-001',
    status: 'PENDING',
    decision: null,
    comment: null,
    formdata: null,
    createdAt: new Date('2026-08-01'),
    completedAt: null,
    instance: makeProcessInstance(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WorkflowSchema 构建辅助
// ---------------------------------------------------------------------------

/** 构造最小化的 WorkflowSchema（start → end 直连）。 */
export function makeSimpleSchema(
  overrides: { nodes?: unknown[]; edges?: unknown[] } = {},
): WorkflowSchema {
  return {
    nodes: [
      { id: 'node-start', type: 'start', meta: {}, data: {} },
      { id: 'node-end', type: 'end', meta: {}, data: {} },
    ],
    edges: [{ sourceNodeID: 'node-start', targetNodeID: 'node-end' }],
    ...overrides,
  } as WorkflowSchema;
}
