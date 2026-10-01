/**
 * EnvironmentService 单测（R1.4）——发布/回滚/预检/环境变量治理语义。
 *
 * 核心断言：
 * 1. deploy：切指针 + Deployment 写入；G4 必填环境变量缺失 → 400 硬拦
 * 2. rollback：kind=rollback + 指针回切
 * 3. preflight：破坏性变更与 G1 引用清单为警告级（不拦截）
 * 4. 环境变量：敏感值加密落库、读取打码（G3）
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EnvironmentService } from './environment.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

beforeAll(() => {
  process.env.CONNECTOR_ENCRYPTION_KEY = 'a'.repeat(64);
});

const APP = 'app-1';
const TENANT = 't1';
const ENV_ROW = {
  id: 'envrow-1',
  appId: APP,
  tenantId: TENANT,
  key: 'prod',
  currentVersionId: null,
};

function makeService() {
  const prisma = getMockPrisma();
  const resolver = {
    ensureEnvironments: vi.fn().mockResolvedValue({ dev: 'envrow-dev', prod: 'envrow-1' }),
    invalidateApp: vi.fn(),
  };
  const svc = new EnvironmentService(resolver as never);
  return { svc, prisma, resolver };
}

describe('deploy（发布=切指针）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('切 currentVersionId + 写 Deployment(kind=deploy) + 失效缓存', async () => {
    const { svc, prisma, resolver } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.appVersion.findFirst.mockResolvedValue({
      id: 'v-2',
      appId: APP,
      tenantId: TENANT,
      versionNumber: '1.0.1',
      snapshot: {},
      changeSet: null,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });
    prisma.envVarDef.findMany.mockResolvedValue([]);
    prisma.envVarValue.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as never[]));
    prisma.appEnvironment.update.mockResolvedValue({});
    prisma.deployment.create.mockResolvedValue({
      id: 'dep-1',
      environmentId: 'envrow-1',
      versionId: 'v-2',
      kind: 'deploy',
      operator: 'u1',
      note: null,
      createdAt: new Date(),
    });
    prisma.appEnvironment.findMany.mockResolvedValue([{ ...ENV_ROW, currentVersionId: 'v-2' }]);
    prisma.appVersion.findFirst.mockResolvedValueOnce({
      id: 'v-2',
      appId: APP,
      tenantId: TENANT,
      versionNumber: '1.0.1',
      snapshot: {},
      changeSet: null,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });

    const result = await svc.deploy(TENANT, APP, 'prod', 'u1', { versionId: 'v-2' });

    expect(result.deployment.versionNumber).toBe('1.0.1');
    expect(prisma.appEnvironment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'envrow-1' }, data: { currentVersionId: 'v-2' } }),
    );
    expect(resolver.invalidateApp).toHaveBeenCalledWith(APP);
  });

  it('G4：必填环境变量缺失 → BadRequest 不切指针', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.appVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      appId: APP,
      tenantId: TENANT,
      versionNumber: '1.0.0',
      snapshot: {},
      changeSet: null,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    });
    prisma.envVarDef.findMany.mockResolvedValue([{ id: 'def-1', key: 'API_KEY', required: true }]);
    prisma.envVarValue.findMany.mockResolvedValue([]);

    await expect(svc.deploy(TENANT, APP, 'prod', 'u1')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('无可用版本 → NotFound', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.appVersion.findFirst.mockResolvedValue(null);
    await expect(svc.deploy(TENANT, APP, 'prod', 'u1')).rejects.toThrow(NotFoundException);
  });
});

describe('rollback（回滚=指针回切）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('写 Deployment(kind=rollback) + 切回目标版本', async () => {
    const { svc, prisma, resolver } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.appVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      appId: APP,
      tenantId: TENANT,
      versionNumber: '1.0.0',
    });
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as never[]));
    prisma.appEnvironment.update.mockResolvedValue({});
    prisma.deployment.create.mockResolvedValue({
      id: 'dep-2',
      environmentId: 'envrow-1',
      versionId: 'v-1',
      kind: 'rollback',
      operator: 'u1',
      note: null,
      createdAt: new Date(),
    });
    prisma.appEnvironment.findMany.mockResolvedValue([{ ...ENV_ROW, currentVersionId: 'v-1' }]);

    const result = await svc.rollback(TENANT, APP, 'prod', 'v-1', 'u1');

    expect(result.deployment.kind).toBe('rollback');
    const created = prisma.deployment.create.mock.calls[0]![0] as { data: { kind: string } };
    expect(created.data.kind).toBe('rollback');
    expect(resolver.invalidateApp).toHaveBeenCalledWith(APP);
  });
});

describe('preflight（G4 硬闸 + 半自动警告）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('缺失必填进 missingRequired；DELETE 变更进 destructiveWarnings；${env.*} 引用进 envRefWarnings', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.appVersion.findFirst.mockResolvedValue({
      id: 'v-1',
      appId: APP,
      tenantId: TENANT,
      snapshot: { pages: [{ api: '${env.BASE}/x' }] },
      changeSet: {
        modules: [
          { module: 'OBJECT', changes: [{ changeType: 'DELETE', entityName: '废弃对象' }] },
        ],
      },
    });
    prisma.envVarDef.findMany.mockResolvedValue([{ id: 'def-1', key: 'BASE', required: true }]);
    prisma.envVarValue.findMany.mockResolvedValue([{ defId: 'def-1', value: 'https://x' }]);

    const r = await svc.preflight(TENANT, APP, 'prod', 'v-1');
    expect(r.ok).toBe(true); // BASE 已设值
    expect(r.missingRequired).toEqual([]);
    expect(r.destructiveWarnings.join()).toContain('废弃对象');
    expect(r.envRefWarnings.join()).toContain('env.BASE');
  });

  it('必填未设值 → ok=false + missingRequired 列出 key', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.appVersion.findFirst.mockResolvedValue({ id: 'v-1', snapshot: {}, changeSet: null });
    prisma.envVarDef.findMany.mockResolvedValue([{ id: 'def-1', key: 'TOKEN', required: true }]);
    prisma.envVarValue.findMany.mockResolvedValue([]);

    const r = await svc.preflight(TENANT, APP, 'prod', 'v-1');
    expect(r.ok).toBe(false);
    expect(r.missingRequired).toEqual(['TOKEN']);
  });
});

describe('环境变量（G3）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('敏感值：落库加密、读取返回 null + isSet=true', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.envVarDef.findFirst.mockResolvedValue({ id: 'def-1', key: 'SECRET', sensitive: true });
    prisma.envVarValue.upsert.mockResolvedValue({
      id: 'val-1',
      environmentId: 'envrow-1',
      defId: 'def-1',
      value: 'encrypted-cipher',
      updatedBy: 'u1',
      updatedAt: new Date(),
    });

    const saved = await svc.setEnvVarValue(TENANT, APP, 'prod', 'def-1', 'my-secret', 'u1');
    expect(saved.value).toBeNull(); // 不可读
    expect(saved.isSet).toBe(true);
    const upsert = prisma.envVarValue.upsert.mock.calls[0]![0] as { update: { value: string } };
    expect(upsert.update.value).not.toBe('my-secret'); // 已加密
    expect(upsert.update.value).toContain(':'); // iv:tag:cipher 格式
  });

  it('非敏感值：明文落库、读取返回原值', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(ENV_ROW);
    prisma.envVarDef.findFirst.mockResolvedValue({ id: 'def-2', key: 'BASE', sensitive: false });
    prisma.envVarValue.upsert.mockResolvedValue({
      id: 'val-2',
      environmentId: 'envrow-1',
      defId: 'def-2',
      value: 'https://x',
      updatedBy: 'u1',
      updatedAt: new Date(),
    });

    const saved = await svc.setEnvVarValue(TENANT, APP, 'prod', 'def-2', 'https://x', 'u1');
    expect(saved.value).toBe('https://x');
  });

  it('重复定义 Key → BadRequest', async () => {
    const { svc, prisma } = makeService();
    prisma.envVarDef.findFirst.mockResolvedValue({ id: 'def-1' });
    await expect(svc.createEnvVarDef(TENANT, APP, { key: 'DUP' }, 'u1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
