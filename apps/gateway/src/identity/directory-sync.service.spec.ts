/**
 * 目录同步管道单测 — 部门拓扑 upsert、JIT 建号、邮箱冲突、离职禁用、同步日志。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DirectorySyncService } from './directory-sync.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import type { DeptRecord, UserRecord } from './external-identity.types.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- mock 回调参数结构因用例而异，精确类型无验证价值 */

function createFakeSource(departments: DeptRecord[], users: UserRecord[]) {
  return {
    type: 'ldap' as const,
    supportsIncremental: false,
    pullDepartments: vi.fn().mockResolvedValue(departments),
    pullUsers: vi.fn().mockResolvedValue(users),
  };
}

describe('DirectorySyncService', () => {
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = getMockPrisma();
    vi.clearAllMocks();
    prisma.integrationConfig.findUnique.mockResolvedValue({ config: {}, isActive: true });
    prisma.directorySyncLog.create.mockResolvedValue({});
    prisma.userIdentity.findMany.mockResolvedValue([]);
    prisma.userIdentity.create.mockResolvedValue({});
    prisma.userIdentity.update.mockResolvedValue({});
    prisma.orgNode.findMany.mockResolvedValue([]);
    prisma.orgNode.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: `org-${data.code}`,
        code: data.code,
        name: data.name,
        parentId: data.parentId ?? null,
      }),
    );
    prisma.orgNode.update.mockResolvedValue({});
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `user-${data.email}`, email: data.email, name: data.name }),
    );
    prisma.user.update.mockResolvedValue({});
    prisma.orgMember.create.mockResolvedValue({});
    prisma.orgMember.upsert.mockResolvedValue({});
  });

  it('未启用的目录源：抛 BadRequestException', async () => {
    prisma.integrationConfig.findUnique.mockResolvedValue(null);
    const service = new DirectorySyncService();
    await expect(service.syncTenant('t1', 'ldap')).rejects.toThrowError(BadRequestException);
  });

  it('全量同步：父先子后建部门树 + 更新已绑定用户 + JIT 建号 + 邮箱冲突计数 + 离职禁用', async () => {
    prisma.orgNode.findMany
      .mockResolvedValueOnce([]) // syncDepartments：无既有节点
      .mockResolvedValueOnce([
        // 人员挂载：部门编码 → id
        { id: 'org-D0', code: 'D0' },
        { id: 'org-D1', code: 'D1' },
      ]);
    prisma.userIdentity.findMany.mockResolvedValue([
      { id: 'bind-1', userId: 'user-1', externalId: 'E1' },
      { id: 'bind-9', userId: 'user-9', externalId: 'E9' }, // 离职（源中消失）
    ]);
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      where.email === 'clash@x.com' ? Promise.resolve({ id: 'user-other' }) : Promise.resolve(null),
    );

    const service = new DirectorySyncService();
    const fakeSource = createFakeSource(
      [
        { externalId: 'D1', name: '研发部', parentExternalId: 'D0' },
        { externalId: 'D0', name: '总部', parentExternalId: null },
      ],
      [
        { externalId: 'E1', name: '张三(更新)', email: 'z@x.com', departmentExternalId: 'D1' },
        { externalId: 'E2', name: '李四', email: 'new@x.com', departmentExternalId: 'D1' },
        { externalId: 'E3', name: '王五', email: 'clash@x.com' },
      ],
    );
    vi.spyOn(service, 'buildSource').mockReturnValue(fakeSource as never);

    const stats = await service.syncTenant('t1', 'ldap');

    // 部门：D0 先建，D1 后建且父指向 D0
    expect(stats.departments).toEqual({ created: 2, updated: 0, total: 2 });
    const createCalls = prisma.orgNode.create.mock.calls.map((c: any[]) => c[0].data);
    expect(createCalls[0]).toMatchObject({ code: 'D0', parentId: null });
    expect(createCalls[1]).toMatchObject({ code: 'D1', parentId: 'org-D0' });

    // 人员：E1 更新、E2 建号、E3 冲突、E9 禁用
    expect(stats.users).toMatchObject({
      created: 1,
      updated: 1,
      disabled: 1,
      conflicts: 1,
      total: 3,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ name: '张三(更新)', status: 'ACTIVE' }),
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { status: 'DISABLED' },
    });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.userIdentity.create).toHaveBeenCalledTimes(1);
    expect(stats.conflicts[0]).toContain('E3');

    // 同步日志
    expect(prisma.directorySyncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 't1', source: 'ldap', status: 'success' }),
    });
  });

  it('同步异常：写错误日志并向上抛出', async () => {
    const service = new DirectorySyncService();
    vi.spyOn(service, 'buildSource').mockImplementation(() => {
      throw new Error('LDAP 不可达');
    });
    await expect(service.syncTenant('t1', 'ldap')).rejects.toThrow('LDAP 不可达');
    expect(prisma.directorySyncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'ldap', status: 'error' }),
    });
  });
});
