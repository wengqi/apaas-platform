/**
 * 租户隔离注入逻辑测试 — 纯函数注入正确性。
 *
 * 测试覆盖：
 * - decideInjection: 白名单/排除/系统上下文/无上下文 决策
 * - injectToWhere: where 子句注入
 * - injectToData: data 注入（单对象 + 数组）
 * - injectToUpsert: where + create 双重注入
 */

import { describe, it, expect } from 'vitest';
import {
  decideEnvInjection,
  decideInjection,
  injectToWhere,
  injectToData,
  injectToUpsert,
  injectEnvToData,
  injectEnvToUpsert,
  injectEnvToWhere,
} from './tenant-injection.js';
import { ENV_SCOPED_MODELS } from './tenant-models.js';
import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { runWithTenant, runAsSystem, getTenantContext } from './tenant-context.js';

describe('decideInjection', () => {
  it('白名单模型 + 有租户上下文 → 注入', () => {
    runWithTenant('tenant-1', () => {
      const result = decideInjection('Record', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(true);
      expect(result.tenantId).toBe('tenant-1');
      expect(result.systemContext).toBe(false);
    });
  });

  it('白名单模型 + 无上下文 → 不注入，非系统上下文', () => {
    const result = decideInjection('Record', getTenantContext(), TENANT_SCOPED_MODELS);
    expect(result.inject).toBe(false);
    expect(result.tenantId).toBeNull();
    expect(result.systemContext).toBe(false);
  });

  it('白名单模型 + 系统上下文 → 不注入，系统上下文', () => {
    runAsSystem(() => {
      const result = decideInjection('Record', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(false);
      expect(result.tenantId).toBeNull();
      expect(result.systemContext).toBe(true);
    });
  });

  it('排除模型（Tenant）+ 有租户上下文 → 不注入', () => {
    runWithTenant('tenant-1', () => {
      const result = decideInjection('Tenant', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(false);
      expect(result.tenantId).toBeNull();
      expect(result.systemContext).toBe(false);
    });
  });

  it('排除模型（UserRole）+ 有租户上下文 → 不注入', () => {
    runWithTenant('tenant-1', () => {
      const result = decideInjection('UserRole', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(false);
    });
  });

  it('排除模型（OrgMember）+ 有租户上下文 → 不注入', () => {
    runWithTenant('tenant-1', () => {
      const result = decideInjection('OrgMember', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(false);
    });
  });

  it('排除模型（View）+ 有租户上下文 → 不注入', () => {
    runWithTenant('tenant-1', () => {
      const result = decideInjection('View', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(false);
    });
  });

  it('排除模型（NodeExecution）+ 有租户上下文 → 不注入', () => {
    runWithTenant('tenant-1', () => {
      const result = decideInjection('NodeExecution', getTenantContext(), TENANT_SCOPED_MODELS);
      expect(result.inject).toBe(false);
    });
  });

  it('所有 29 个白名单模型在有租户上下文时都注入', () => {
    const models = Array.from(TENANT_SCOPED_MODELS);
    expect(models).toHaveLength(29);

    runWithTenant('tenant-all', () => {
      for (const model of models) {
        const result = decideInjection(model, getTenantContext(), TENANT_SCOPED_MODELS);
        expect(result.inject, `${model} should inject`).toBe(true);
        expect(result.tenantId, `${model} tenantId`).toBe('tenant-all');
      }
    });
  });
});

describe('injectToWhere', () => {
  it('将 tenantId 注入到 where 子句', () => {
    const args: Record<string, unknown> = { where: { id: 'rec-1' } };
    injectToWhere(args, 'tenant-1');
    expect(args.where).toEqual({ id: 'rec-1', tenantId: 'tenant-1' });
  });

  it('where 为空时创建 where.tenantId', () => {
    const args: Record<string, unknown> = {};
    injectToWhere(args, 'tenant-1');
    expect(args.where).toEqual({ tenantId: 'tenant-1' });
  });

  it('不修改原始 where 对象（浅拷贝）', () => {
    const originalWhere = { id: 'rec-1' };
    const args: Record<string, unknown> = { where: originalWhere };
    injectToWhere(args, 'tenant-1');
    expect(args.where).not.toBe(originalWhere);
    expect(originalWhere).toEqual({ id: 'rec-1' });
  });

  it('保留 where 中的其他条件', () => {
    const args: Record<string, unknown> = {
      where: { id: 'rec-1', status: 'ACTIVE', appId: 'app-1' },
    };
    injectToWhere(args, 'tenant-1');
    expect(args.where).toEqual({
      id: 'rec-1',
      status: 'ACTIVE',
      appId: 'app-1',
      tenantId: 'tenant-1',
    });
  });
});

describe('injectToData', () => {
  it('将 tenantId 注入到单个 data 对象', () => {
    const args: Record<string, unknown> = { data: { name: 'test', appId: 'app-1' } };
    injectToData(args, 'tenant-1');
    expect(args.data).toEqual({ name: 'test', appId: 'app-1', tenantId: 'tenant-1' });
  });

  it('将 tenantId 注入到 data 数组的每个元素', () => {
    const args: Record<string, unknown> = {
      data: [{ name: 'item-1' }, { name: 'item-2' }, { name: 'item-3' }],
    };
    injectToData(args, 'tenant-1');
    expect(args.data).toEqual([
      { name: 'item-1', tenantId: 'tenant-1' },
      { name: 'item-2', tenantId: 'tenant-1' },
      { name: 'item-3', tenantId: 'tenant-1' },
    ]);
  });

  it('data 为空对象时创建 data.tenantId', () => {
    const args: Record<string, unknown> = { data: {} };
    injectToData(args, 'tenant-1');
    expect(args.data).toEqual({ tenantId: 'tenant-1' });
  });

  it('不修改原始 data 对象（浅拷贝）', () => {
    const originalData = { name: 'test' };
    const args: Record<string, unknown> = { data: originalData };
    injectToData(args, 'tenant-1');
    expect(args.data).not.toBe(originalData);
    expect(originalData).toEqual({ name: 'test' });
  });

  it('不修改原始数组中的元素（浅拷贝每个元素）', () => {
    const originalItem = { name: 'item-1' };
    const args: Record<string, unknown> = { data: [originalItem] };
    injectToData(args, 'tenant-1');
    expect((args.data as Array<Record<string, unknown>>)[0]).not.toBe(originalItem);
    expect(originalItem).toEqual({ name: 'item-1' });
  });
});

describe('injectToUpsert', () => {
  it('将 tenantId 注入到 where + create', () => {
    const args: Record<string, unknown> = {
      where: { id: 'rec-1' },
      create: { name: 'new-record', appId: 'app-1' },
      update: { name: 'updated' },
    };
    injectToUpsert(args, 'tenant-1');
    expect(args.where).toEqual({ id: 'rec-1', tenantId: 'tenant-1' });
    expect(args.create).toEqual({ name: 'new-record', appId: 'app-1', tenantId: 'tenant-1' });
    // update 不注入 tenantId（where.tenantId 已保障归属）
    expect(args.update).toEqual({ name: 'updated' });
  });

  it('where 和 create 为空时创建 tenantId', () => {
    const args: Record<string, unknown> = {};
    injectToUpsert(args, 'tenant-1');
    expect(args.where).toEqual({ tenantId: 'tenant-1' });
    expect(args.create).toEqual({ tenantId: 'tenant-1' });
  });

  it('不修改原始 where/create 对象', () => {
    const originalWhere = { id: 'rec-1' };
    const originalCreate = { name: 'test' };
    const args: Record<string, unknown> = {
      where: originalWhere,
      create: originalCreate,
    };
    injectToUpsert(args, 'tenant-1');
    expect(args.where).not.toBe(originalWhere);
    expect(args.create).not.toBe(originalCreate);
    expect(originalWhere).toEqual({ id: 'rec-1' });
    expect(originalCreate).toEqual({ name: 'test' });
  });
});

describe('TENANT_SCOPED_MODELS', () => {
  it('包含 29 个模型', () => {
    expect(TENANT_SCOPED_MODELS.size).toBe(29);
  });

  it('包含所有预期模型', () => {
    const expected = [
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
      'ChangeLog',
      'AppCheck',
      'Connector',
      'ConnectorCredential',
      'DataFlow',
      'Dataset',
      'DatasetRow',
      'CloudFunction',
    ];
    for (const model of expected) {
      expect(TENANT_SCOPED_MODELS.has(model), `${model} should be in set`).toBe(true);
    }
  });

  it('不包含排除模型', () => {
    const excluded = ['Tenant', 'UserRole', 'OrgMember', 'View', 'NodeExecution'];
    for (const model of excluded) {
      expect(TENANT_SCOPED_MODELS.has(model), `${model} should NOT be in set`).toBe(false);
    }
  });
});

// ===========================================================================
// R1.4 多环境：environmentId 第二维注入
// ===========================================================================

describe('decideEnvInjection（R1.4）', () => {
  it('白名单模型 + 有环境上下文 → 注入', () => {
    const d = decideEnvInjection('Record', 'dev', ENV_SCOPED_MODELS);
    expect(d).toEqual({ inject: true, environmentId: 'dev' });
  });

  it('白名单模型但无环境上下文 → 不注入不告警（兼容旧路径）', () => {
    const d = decideEnvInjection('ProcessInstance', null, ENV_SCOPED_MODELS);
    expect(d).toEqual({ inject: false, environmentId: null });
  });

  it('非白名单模型（如 Application）→ 不注入', () => {
    const d = decideEnvInjection('Application', 'prod', ENV_SCOPED_MODELS);
    expect(d).toEqual({ inject: false, environmentId: null });
  });

  it('ENV_SCOPED_MODELS 只含四个运行数据模型', () => {
    expect([...ENV_SCOPED_MODELS].sort()).toEqual([
      'AutoNumberCounter',
      'NodeExecution',
      'ProcessInstance',
      'Record',
    ]);
  });
});

describe('injectEnvToWhere / injectEnvToData / injectEnvToUpsert（R1.4）', () => {
  it('where 浅拷贝追加 environmentId，不改原对象', () => {
    const args: Record<string, unknown> = { where: { tenantId: 't1' } };
    injectEnvToWhere(args, 'dev');
    expect(args.where).toEqual({ tenantId: 't1', environmentId: 'dev' });
  });

  it('data 单对象与数组两种形式', () => {
    const single: Record<string, unknown> = { data: { appId: 'a' } };
    injectEnvToData(single, 'prod');
    expect(single.data).toEqual({ appId: 'a', environmentId: 'prod' });
    const many: Record<string, unknown> = { data: [{ x: 1 }, { y: 2 }] };
    injectEnvToData(many, 'dev');
    expect(many.data).toEqual([
      { x: 1, environmentId: 'dev' },
      { y: 2, environmentId: 'dev' },
    ]);
  });

  it('upsert 双重注入 where + create', () => {
    const args: Record<string, unknown> = { where: { objectId: 'o1' }, create: { prefix: 'P' } };
    injectEnvToUpsert(args, 'prod');
    expect(args.where).toEqual({ objectId: 'o1', environmentId: 'prod' });
    expect(args.create).toEqual({ prefix: 'P', environmentId: 'prod' });
  });
});
