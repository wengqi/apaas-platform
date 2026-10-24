/**
 * ApiKeyService 单测（G6）——生成/校验/吊销语义。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const TENANT = 't1';

describe('ApiKeyService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create：明文仅返回一次，库中只存 sha256', async () => {
    const prisma = getMockPrisma();
    prisma.serviceIdentity.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'si-1',
        tenantId: TENANT,
        appId: 'app-1',
        name: data.name,
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        status: 'ACTIVE',
        lastUsedAt: null,
        createdBy: 'u1',
        createdAt: new Date(),
      }),
    );

    const r = await new ApiKeyService().create(TENANT, 'u1', { name: 'ERP', appId: 'app-1' });

    expect(r.apiKey).toMatch(/^ak_[0-9a-f]{48}$/);
    expect(r.keyPrefix).toBe(r.apiKey.slice(0, 12));
    expect(r.keyPrefix.length).toBe(12);
    // keyHash ≠ 明文（64 hex = sha256）
    expect(r.apiKey).not.toContain(
      prisma.serviceIdentity.create.mock.calls[0]![0].data.keyHash as string,
    );
  });

  it('verify：有效 key → 合成身份（tenantId/isSuperAdmin=false）', async () => {
    const svc = new ApiKeyService();
    const prisma = getMockPrisma();
    prisma.serviceIdentity.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'si-1',
        tenantId: TENANT,
        appId: null,
        name: 'x',
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        status: 'ACTIVE',
        lastUsedAt: null,
        createdBy: 'u1',
        createdAt: new Date(),
      }),
    );
    prisma.serviceIdentity.findUnique.mockImplementation(
      async ({ where }: { where: { keyHash: string } }) => {
        const created = prisma.serviceIdentity.create.mock.calls[0]![0] as {
          data: { keyHash: string };
        };
        return where.keyHash === created.data.keyHash
          ? { id: 'si-1', tenantId: TENANT, status: 'ACTIVE' }
          : null;
      },
    );
    prisma.serviceIdentity.update.mockResolvedValue({});

    const created = await svc.create(TENANT, 'u1', { name: 'x' });
    const user = await svc.verify(created.apiKey);
    expect(user.tenantId).toBe(TENANT);
    expect(user.isSuperAdmin).toBe(false);
    expect(user.serviceIdentityId).toBe('si-1');
  });

  it('verify：未知/吊销/格式错误 key → 统一 401 脱敏', async () => {
    const svc = new ApiKeyService();
    const prisma = getMockPrisma();
    prisma.serviceIdentity.findUnique.mockResolvedValue(null);

    await expect(svc.verify('ak_deadbeef')).rejects.toThrow(UnauthorizedException);
    await expect(svc.verify('not-a-key')).rejects.toThrow(UnauthorizedException);
    await expect(svc.verify('')).rejects.toThrow(UnauthorizedException);

    // 吊销态同样 401（不区分原因）
    prisma.serviceIdentity.findUnique.mockResolvedValue({
      id: 'si-1',
      tenantId: TENANT,
      status: 'REVOKED',
    });
    await expect(svc.verify('ak_deadbeef')).rejects.toThrow(UnauthorizedException);
  });

  it('revoke：where 含 tenantId（跨租户 id 不可命中——IDOR 防御）', async () => {
    const svc = new ApiKeyService();
    const prisma = getMockPrisma();
    prisma.serviceIdentity.update.mockResolvedValue({
      id: 'si-victim',
      tenantId: 't-other',
      appId: null,
      name: 'x',
      keyPrefix: 'ak_123',
      status: 'REVOKED',
      lastUsedAt: null,
      createdBy: 'u1',
      createdAt: new Date(),
    });

    await svc.revoke(TENANT, 'u1', 'si-victim');
    // Layer 1 显式过滤：调用方租户必须进 where（$extends 白名单为 Layer 2 双保险）
    expect(prisma.serviceIdentity.update).toHaveBeenCalledWith({
      where: { id: 'si-victim', tenantId: TENANT },
      data: { status: 'REVOKED' },
    });
  });

  it('revoke：置 REVOKED + 审计', async () => {
    const svc = new ApiKeyService();
    const prisma = getMockPrisma();
    prisma.serviceIdentity.update.mockResolvedValue({
      id: 'si-1',
      tenantId: TENANT,
      appId: null,
      name: 'x',
      keyPrefix: 'ak_123',
      status: 'REVOKED',
      lastUsedAt: null,
      createdBy: 'u1',
      createdAt: new Date(),
    });

    const r = await svc.revoke(TENANT, 'u1', 'si-1');
    expect(r.status).toBe('REVOKED');
    expect(prisma.serviceIdentity.update).toHaveBeenCalledWith({
      where: { id: 'si-1', tenantId: TENANT },
      data: { status: 'REVOKED' },
    });
  });

  it('verify：回传 appId（应用绑定身份，供开放 API 数据面作用域比对——对抗审查 security-03）', async () => {
    const svc = new ApiKeyService();
    const prisma = getMockPrisma();
    prisma.serviceIdentity.findUnique.mockResolvedValue({
      id: 'si-bound',
      tenantId: TENANT,
      appId: 'app-A',
      name: 'bound',
      keyPrefix: 'ak_x',
      status: 'ACTIVE',
      lastUsedAt: null,
      createdBy: 'u1',
      createdAt: new Date(),
    });
    prisma.serviceIdentity.update.mockResolvedValue({}); // lastUsedAt fire-and-forget
    const user = await svc.verify('ak_valid');
    expect(user.appId).toBe('app-A');
  });

  it('verify：租户级身份 appId=null', async () => {
    const svc = new ApiKeyService();
    const prisma = getMockPrisma();
    prisma.serviceIdentity.findUnique.mockResolvedValue({
      id: 'si-tenant',
      tenantId: TENANT,
      appId: null,
      name: 'tenant-wide',
      keyPrefix: 'ak_y',
      status: 'ACTIVE',
      lastUsedAt: null,
      createdBy: 'u1',
      createdAt: new Date(),
    });
    prisma.serviceIdentity.update.mockResolvedValue({}); // lastUsedAt fire-and-forget
    const user = await svc.verify('ak_valid');
    expect(user.appId).toBeNull();
  });
});
