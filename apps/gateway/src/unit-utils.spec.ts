/**
 * 工具层单元测试 — crypto.util（AES-256-GCM）/ auto-number（原子计数器）/ jwt.strategy。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptJson, decryptJson } from './connector/crypto.util.js';
import { AutoNumberGenerator } from './object/auto-number.js';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './auth/jwt.strategy.js';
import { getMockPrisma } from './test/test-helpers.js';

// ---------------------------------------------------------------------------
// crypto.util
// ---------------------------------------------------------------------------

describe('crypto.util — AES-256-GCM', () => {
  const KEY_32B = 'a'.repeat(64);

  beforeEach(() => {
    process.env.CONNECTOR_ENCRYPTION_KEY = KEY_32B;
  });

  it('加密后解密还原原始对象', () => {
    const secret = { password: 'p@ss', apiKey: 'k-123', nested: { a: 1 } };
    const encrypted = encryptJson(secret);

    expect(encrypted.split(':')).toHaveLength(3);
    expect(decryptJson(encrypted)).toEqual(secret);
  });

  it('相同明文两次加密产生不同密文（随机 IV）', () => {
    expect(encryptJson({ x: 1 })).not.toBe(encryptJson({ x: 1 }));
  });

  it('密文被篡改时解密失败', () => {
    const encrypted = encryptJson({ x: 1 });
    const parts = encrypted.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${Buffer.from('tampered').toString('base64')}`;
    expect(() => decryptJson(tampered)).toThrow();
  });

  it('密钥未配置或长度错误时抛错', () => {
    delete process.env.CONNECTOR_ENCRYPTION_KEY;
    expect(() => encryptJson({})).toThrow('CONNECTOR_ENCRYPTION_KEY');

    process.env.CONNECTOR_ENCRYPTION_KEY = 'short';
    expect(() => encryptJson({})).toThrow('CONNECTOR_ENCRYPTION_KEY');
  });
});

// ---------------------------------------------------------------------------
// auto-number
// ---------------------------------------------------------------------------

describe('AutoNumberGenerator', () => {
  const prisma = getMockPrisma();
  const generator = new AutoNumberGenerator();

  beforeEach(() => {
    let seq = 0;
    prisma.autoNumberCounter.upsert.mockImplementation(async () => {
      seq += 1;
      return { counter: seq };
    });
  });

  it('ORD-{seq:0000} 渲染为补零编号', async () => {
    const code = await generator.generate('ORD-{seq:0000}', 'obj-1', 't-1');
    expect(code).toBe('ORD-0001');
  });

  it('日期占位符按当日解析并纳入计数前缀', async () => {
    const code = await generator.generate('INV-{yyyy}{mm}{dd}-{seq:000}', 'obj-1', 't-1');
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-`;
    expect(code).toBe(`${prefix}001`);
    const arg = prisma.autoNumberCounter.upsert.mock.calls[0]?.[0];
    expect(arg.where.objectId_prefix.prefix).toBe(prefix);
  });

  it('无序号占位符：不查询计数器，直接渲染日期', async () => {
    prisma.autoNumberCounter.upsert.mockClear();
    const code = await generator.generate('DOC-{yyyy}', 'obj-1', 't-1');
    expect(code).toBe(`DOC-${new Date().getFullYear()}`);
    expect(prisma.autoNumberCounter.upsert).not.toHaveBeenCalled();
  });

  it('未知占位符原样保留', async () => {
    const code = await generator.generate('{unknown}-{seq}', 'obj-1', 't-1');
    expect(code).toBe('{unknown}-1');
  });
});

// ---------------------------------------------------------------------------
// jwt.strategy
// ---------------------------------------------------------------------------

describe('JwtStrategy.validate', () => {
  const prisma = getMockPrisma();

  function makeStrategy(): JwtStrategy {
    const config = { get: vi.fn().mockReturnValue('test-secret') };
    return new JwtStrategy(config as never);
  }

  it('平台超管：返回 isSuperAdmin=true 且不加载角色', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      tenantId: null,
      email: 's@x.dev',
      isPlatformAdmin: true,
      status: 'ACTIVE',
    });
    const strategy = makeStrategy();
    const user = await strategy.validate({
      sub: 'u-1',
      tenantId: null,
      email: 's@x.dev',
      isPlatformAdmin: true,
    });

    expect(user.isSuperAdmin).toBe(true);
    expect(user.tenantId).toBeNull();
    expect(user.roleIds).toEqual([]);
  });

  it('租户用户：返回租户上下文与角色', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-2',
      tenantId: 't-1',
      email: 'a@x.dev',
      isPlatformAdmin: false,
      status: 'ACTIVE',
    });
    prisma.userRole.findMany.mockResolvedValue([{ roleId: 'r-1', role: { code: 'BUILDER' } }]);
    prisma.orgMember.findMany.mockResolvedValue([]);
    const strategy = makeStrategy();
    const user = await strategy.validate({
      sub: 'u-2',
      tenantId: 't-1',
      email: 'a@x.dev',
      isPlatformAdmin: false,
    });

    expect(user.tenantId).toBe('t-1');
    expect(user.isSuperAdmin).toBe(false);
    expect(user.roleCodes).toEqual(['BUILDER']);
  });

  it('用户不存在：抛 UnauthorizedException', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const strategy = makeStrategy();
    await expect(
      strategy.validate({
        sub: 'ghost',
        tenantId: 't-1',
        email: 'g@x.dev',
        isPlatformAdmin: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('用户被禁用（status != ACTIVE）：抛 UnauthorizedException', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-3',
      tenantId: 't-1',
      email: 'd@x.dev',
      isPlatformAdmin: false,
      status: 'SUSPENDED',
    });
    const strategy = makeStrategy();
    await expect(
      strategy.validate({ sub: 'u-3', tenantId: 't-1', email: 'd@x.dev', isPlatformAdmin: false }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
