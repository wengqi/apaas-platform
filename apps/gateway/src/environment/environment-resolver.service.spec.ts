/**
 * EnvironmentResolverService 单测（R1.4）——解析降级链与缓存语义。
 *
 * 核心断言：
 * 1. 指针→AppVersion.snapshot（bundle 模式）+ ${env.*} 实时替换
 * 2. 无指针/无环境行 → 旧 publishedSnapshot 降级（存量兼容）
 * 3. 环境变量改值后重新 resolve 即生效（缓存仅存原始快照）
 * 4. ensureEnvironments 幂等建行；invalidateApp 精确失效
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnvironmentResolverService } from './environment-resolver.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const APP = 'app-1';
const TENANT = 't1';

const SNAPSHOT_V1 = {
  meta: { appId: APP },
  pages: [{ apiName: 'p1', schema: {} }],
  processes: [],
  objects: [],
};

function makeService() {
  const prisma = getMockPrisma();
  const svc = new EnvironmentResolverService();
  return { svc, prisma };
}

describe('resolve（降级链）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('指针→版本快照：bundleMode=true + ${env.*} 实时替换', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue({
      id: 'envrow-p',
      appId: APP,
      tenantId: TENANT,
      key: 'prod',
      currentVersionId: 'v-1',
    });
    prisma.appVersion.findFirst
      .mockResolvedValueOnce({ id: 'v-1', snapshot: { title: '${env.T}' } }) // resolveRaw
      .mockResolvedValue({ id: 'v-1', snapshot: { title: '${env.T}' } });
    prisma.envVarValue.findMany.mockResolvedValue([
      { def: { key: 'T', sensitive: false }, value: 'hello' },
    ]);

    const r = await svc.resolve(TENANT, APP, 'prod');
    expect(r.bundleMode).toBe(true);
    expect(r.versionId).toBe('v-1');
    expect(((r.bundle ?? {}) as { title: string }).title).toBe('hello');
  });

  it('无环境行 → 旧 publishedSnapshot 降级（bundleMode=false）', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(null);
    prisma.application.findFirst.mockResolvedValue({ publishedSnapshot: SNAPSHOT_V1 });

    const r = await svc.resolve(TENANT, APP, 'prod');
    expect(r.bundleMode).toBe(false);
    expect(r.bundle).toEqual(SNAPSHOT_V1);
  });

  it('未部署（指针空）→ 降级旧快照', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue({
      id: 'envrow-p',
      appId: APP,
      key: 'prod',
      currentVersionId: null,
    });
    prisma.application.findFirst.mockResolvedValue({ publishedSnapshot: SNAPSHOT_V1 });

    const r = await svc.resolve(TENANT, APP, 'prod');
    expect(r.bundleMode).toBe(false);
  });

  it('指针悬空（版本缺失）→ 降级 + warn 不抛', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue({
      id: 'envrow-p',
      appId: APP,
      key: 'prod',
      currentVersionId: 'v-ghost',
    });
    prisma.appVersion.findFirst.mockResolvedValue(null);
    prisma.application.findFirst.mockResolvedValue({ publishedSnapshot: SNAPSHOT_V1 });

    const r = await svc.resolve(TENANT, APP, 'prod');
    expect(r.bundleMode).toBe(false);
    expect(r.bundle).toEqual(SNAPSHOT_V1);
  });

  it('降级快照为 null（从未发布）→ bundle null（调用方走活表）', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue(null);
    prisma.application.findFirst.mockResolvedValue({ publishedSnapshot: null });

    const r = await svc.resolve(TENANT, APP, 'prod');
    expect(r.bundle).toBeNull();
  });
});

describe('缓存与失效', () => {
  beforeEach(() => vi.clearAllMocks());

  it('环境变量改值后重新 resolve 立即生效（缓存不存替换结果）', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue({
      id: 'envrow-p',
      appId: APP,
      key: 'prod',
      currentVersionId: 'v-1',
    });
    prisma.appVersion.findFirst.mockResolvedValue({ id: 'v-1', snapshot: { title: '${env.T}' } });
    prisma.envVarValue.findMany
      .mockResolvedValueOnce([{ def: { key: 'T', sensitive: false }, value: 'old' }])
      .mockResolvedValue([{ def: { key: 'T', sensitive: false }, value: 'new' }]);

    const first = await svc.resolve(TENANT, APP, 'prod');
    expect((first.bundle as { title: string }).title).toBe('old');

    // 第二次 resolve：raw bundle 命中缓存，但值重新加载
    const second = await svc.resolve(TENANT, APP, 'prod');
    expect((second.bundle as { title: string }).title).toBe('new');
  });

  it('invalidateApp 精确失效该应用的全部环境缓存', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findFirst.mockResolvedValue({
      id: 'envrow-p',
      appId: APP,
      key: 'prod',
      currentVersionId: 'v-1',
    });
    prisma.appVersion.findFirst.mockResolvedValue({ id: 'v-1', snapshot: { a: 1 } });
    prisma.envVarValue.findMany.mockResolvedValue([]);

    await svc.resolve(TENANT, APP, 'prod');
    svc.invalidateApp(APP);
    // 失效后会重新查环境行
    await svc.resolve(TENANT, APP, 'prod');
    expect(prisma.appEnvironment.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('ensureEnvironments（幂等建行）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('缺失的环境行自动补建', async () => {
    const { svc, prisma } = makeService();
    prisma.appEnvironment.findMany.mockResolvedValue([{ id: 'envrow-dev', key: 'dev' }]);
    prisma.appEnvironment.create.mockResolvedValue({ id: 'envrow-new' });

    const map = await svc.ensureEnvironments(TENANT, APP);
    expect(map['dev']).toBe('envrow-dev');
    expect(map['prod']).toBe('envrow-new');
    expect(prisma.appEnvironment.create).toHaveBeenCalledWith({
      data: { tenantId: TENANT, appId: APP, key: 'prod' },
    });
  });
});
