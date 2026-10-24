/**
 * DesignAccessGuard 单元测试 — /design 前缀成员守卫（ADR-0005 决策 9）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { DesignAccessGuard, STUDIO_ACCESS_DENIED_MESSAGE } from './design-access.guard.js';
import { AppAccessService } from './app-access.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'builder@apaas.dev',
    roleIds: ['role-builder'],
    roleCodes: ['BUILDER'],
    isPlatformAdmin: false,
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeContext(user: AuthenticatedUser | undefined, params: Record<string, string> = {}) {
  const request: Record<string, unknown> = { user, params };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('DesignAccessGuard', () => {
  const prisma = getMockPrisma();
  const guard = new DesignAccessGuard(
    new AppAccessService({ getUserRoleIds: vi.fn().mockResolvedValue([]) } as never),
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未认证请求拒绝', async () => {
    const { ctx } = makeContext(undefined, { appId: 'app-001' });
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('END_USER-only（无 studio 访问权）即使是成员也 403——纵深防御', async () => {
    prisma.applicationMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
    const { ctx } = makeContext(makeUser({ roleCodes: ['END_USER'] }), { appId: 'app-001' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(STUDIO_ACCESS_DENIED_MESSAGE),
    );
    expect(prisma.applicationMember.findFirst).not.toHaveBeenCalled();
  });

  it('路径无 appId（列表/创建/分组/待审汇总）放行，不查成员表', async () => {
    const { ctx, request } = makeContext(makeUser(), {});
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.appAccessRole).toBeUndefined();
    expect(prisma.applicationMember.findFirst).not.toHaveBeenCalled();
  });

  it('成员放行并把角色写入 request.appAccessRole', async () => {
    prisma.applicationMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
    const { ctx, request } = makeContext(makeUser(), { appId: 'app-001' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.appAccessRole).toBe('member');
  });

  it('TENANT_ADMIN 恒放行为 admin，不查成员表', async () => {
    const { ctx, request } = makeContext(
      makeUser({ roleCodes: ['TENANT_ADMIN'], isSuperAdmin: true }),
      { appId: 'app-001' },
    );
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.appAccessRole).toBe('admin');
    expect(prisma.applicationMember.findFirst).not.toHaveBeenCalled();
  });

  it('非成员 BUILDER 深链他人应用 → 403', async () => {
    prisma.applicationMember.findFirst.mockResolvedValue(null);
    const { ctx } = makeContext(makeUser(), { appId: 'app-other' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
