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
