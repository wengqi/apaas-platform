/**
 * DataAppAccessGuard 单测——数据面双门守卫（对抗审查 devil-01/R1，P0-9 回归）。
 *
 * 钉住路由形态 → appId 解析与断言委托：
 * params.appId（chart-data）/ params.objectId / params.recordId / body.recordIds（批量，跨对象去重）。
 * 断言语义本身在 app-access.service.spec 覆盖，本 spec 只钉守卫接线。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataAppAccessGuard } from './data-app-access.guard.js';
import { AppAccessService } from './app-access.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const USER = {
  id: 'user-001',
  tenantId: 'tenant-001',
  email: 'enduser@apaas.dev',
  roleIds: ['role-1'],
  roleCodes: ['END_USER'],
  isPlatformAdmin: false,
  isSuperAdmin: false,
};

function makeContext(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

describe('DataAppAccessGuard', () => {
  let assertDataAccess: ReturnType<typeof vi.fn>;
  let guard: DataAppAccessGuard;
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
    assertDataAccess = vi.fn().mockResolvedValue(undefined);
    guard = new DataAppAccessGuard({
      assertDataAccess,
    } as unknown as AppAccessService);
  });

  it('params.appId（chart-data 形态）→ 直接断言', async () => {
    const req = { user: USER, params: { appId: 'app-1' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(assertDataAccess).toHaveBeenCalledWith('tenant-001', USER, 'app-1');
  });

  it('params.objectId → objectMeta 反查 appId', async () => {
    prisma.objectMeta.findUnique.mockResolvedValue({ appId: 'app-9' });
    const req = { user: USER, params: { objectId: 'obj-1' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(assertDataAccess).toHaveBeenCalledWith('tenant-001', USER, 'app-9');
  });

  it('params.objectId 无对应对象 → 404「对象不存在」', async () => {
    prisma.objectMeta.findUnique.mockResolvedValue(null);
    const req = { user: USER, params: { objectId: 'obj-missing' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow('对象不存在');
  });

  it('params.recordId → 记录反查对象 → appId', async () => {
    prisma.record.findUnique.mockResolvedValue({ objectId: 'obj-2' });
    prisma.objectMeta.findUnique.mockResolvedValue({ appId: 'app-2' });
    const req = { user: USER, params: { recordId: 'rec-1' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(assertDataAccess).toHaveBeenCalledWith('tenant-001', USER, 'app-2');
  });

  it('批量路由（body.recordIds 跨对象）→ 去重后逐 appId 断言', async () => {
    prisma.record.findMany.mockResolvedValue([
      { objectId: 'obj-1' },
      { objectId: 'obj-2' },
      { objectId: 'obj-1' },
    ]);
    prisma.objectMeta.findUnique
      .mockResolvedValueOnce({ appId: 'app-A' })
      .mockResolvedValueOnce({ appId: 'app-B' })
      .mockResolvedValueOnce({ appId: 'app-A' });
    const req = {
      user: USER,
      params: {},
      body: { recordIds: ['r1', 'r2', 'r3'] },
    };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    const calledApps = assertDataAccess.mock.calls.map((c) => c[2]);
    expect(calledApps).toEqual(['app-A', 'app-B']);
  });

  it('无 user（PermissionGuard 未先行的误挂）→ false', async () => {
    const req = { params: { appId: 'app-1' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(false);
    expect(assertDataAccess).not.toHaveBeenCalled();
  });
});
