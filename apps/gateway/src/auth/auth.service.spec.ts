/**
 * AuthService 单元测试 — 登录认证。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
}));

import { AuthService } from './auth.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import * as bcrypt from 'bcrypt';

function createMockJwtService() {
  return {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
  };
}

function createService() {
  const jwtService = createMockJwtService();
  const service = new AuthService(
    jwtService as unknown as ConstructorParameters<typeof AuthService>[0],
  );
  return { service, jwtService };
}

describe('AuthService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('用户不存在应抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.login('none@example.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('密码错误应抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        tenantId: null,
        email: 'test@example.com',
        password: '$2b$10$mockHash',
        isPlatformAdmin: true,
        status: 'ACTIVE',
      });
      (
        vi.mocked(bcrypt.compare) as unknown as { mockResolvedValue: (v: boolean) => void }
      ).mockResolvedValue(false);

      const { service } = createService();
      await expect(service.login('test@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('账户被停用应抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        tenantId: null,
        email: 'test@example.com',
        password: '$2b$10$mockHash',
        isPlatformAdmin: true,
        status: 'SUSPENDED',
      });

      const { service } = createService();
      await expect(service.login('test@example.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

describe('AuthService.refresh（JWT 刷新）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无效 refreshToken 应抛出 UnauthorizedException', async () => {
    const jwtService = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')),
    };
    const service = new AuthService(jwtService as never);
    await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
  });

  it('有效 refreshToken → 换发新 access/refresh 对（refresh 用派生密钥）', async () => {
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue('new-token'),
      verifyAsync: vi.fn().mockResolvedValue({
        sub: 'user-001',
        tenantId: null,
        email: 'test@example.com',
        isPlatformAdmin: true,
      }),
    };
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-001',
      tenantId: null,
      email: 'test@example.com',
      name: '测试',
      avatar: null,
      status: 'ACTIVE',
      isPlatformAdmin: true,
      tenant: null,
      userRoles: [],
    });
    const service = new AuthService(jwtService as never);
    const r = await service.refresh('valid-refresh-token');
    expect(r.ok).toBe(true);
    // 第二次签发（refresh）必须显式传派生 secret，与 access 密钥隔离
    const refreshCall = jwtService.signAsync.mock.calls.find((c) => c[1]?.secret);
    expect(refreshCall?.[1]?.secret).toContain(':refresh');
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'valid-refresh-token',
      expect.objectContaining({ secret: expect.stringContaining(':refresh') }),
    );
    // 刷新时复核用户状态
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-001' } }),
    );
  });

  it('refresh 时用户已被禁用 → 拒绝', async () => {
    const jwtService = {
      signAsync: vi.fn(),
      verifyAsync: vi.fn().mockResolvedValue({ sub: 'user-001' }),
    };
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-001',
      status: 'DISABLED',
      tenant: null,
      userRoles: [],
    });
    const service = new AuthService(jwtService as never);
    await expect(service.refresh('valid-refresh-token')).rejects.toThrow(UnauthorizedException);
  });
});
