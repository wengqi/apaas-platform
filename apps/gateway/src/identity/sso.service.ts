/**
 * SSO 登录服务 — CAS 回调的绑定/建号与平台 JWT 签发。
 *
 * 回调处理顺序：
 * 1. ticket 校验（CasAuthProvider）得到 ExternalIdentity
 * 2. UserIdentity 绑定存在 → 取平台用户（ACTIVE + 租户 ACTIVE 校验）
 * 3. 未绑定但邮箱匹配租户内既有用户 → 自动绑定（CAS 已验证该邮箱属此人）
 * 4. 邮箱无匹配 → JIT 建号（随机密码使密码登录不可用，默认无角色，待管理员授权）
 * 5. 签发平台 JWT（与本地登录同构的 payload）
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@apaas/db';
import type { JwtPayload } from '../auth/auth.service.js';
import { CasAuthProvider } from './cas-auth.provider.js';
import { IdentityConfigService } from './identity-config.service.js';
import type { CasConfig } from './external-identity.types.js';

@Injectable()
export class SsoService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: IdentityConfigService,
  ) {}

  /** CAS 登录：构造跳转 URL（service 参数携带 tenant 标识，回调时定位租户与配置） */
  async buildCasLoginUrl(tenantSlug: string): Promise<string> {
    const provider = await this.resolveCasProvider(tenantSlug);
    return provider.buildLoginUrl();
  }

  /** CAS 回调：ticket 校验 → 绑定/建号 → 签发平台 JWT */
  async casCallback(tenantSlug: string, query: Record<string, string>) {
    const provider = await this.resolveCasProvider(tenantSlug);
    const identity = await provider.handleCallback(query);

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('租户不存在或已被挂起');
    }

    // 1) 已有绑定
    const binding = await prisma.userIdentity.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: tenant.id,
          provider: 'cas',
          externalId: identity.externalId,
        },
      },
      include: { user: true },
    });
    let user = binding?.user;

    // 2) 未绑定：邮箱匹配既有用户 → 自动绑定
    if (!user && identity.email) {
      const byEmail = await prisma.user.findFirst({
        where: { tenantId: tenant.id, email: identity.email },
      });
      if (byEmail) {
        if (byEmail.status !== 'ACTIVE') {
          throw new UnauthorizedException('用户已被禁用');
        }
        await prisma.userIdentity.create({
          data: {
            tenantId: tenant.id,
            userId: byEmail.id,
            provider: 'cas',
            externalId: identity.externalId,
            lastSyncAt: new Date(),
          },
        });
        user = byEmail;
      }
    }

    // 3) 无匹配用户 → JIT 建号（随机密码使密码登录不可用；默认无角色，待管理员授权）
    if (!user) {
      const email = identity.email ?? `${identity.externalId}@identity.local`;
      const emailTaken = await prisma.user.findFirst({
        where: { tenantId: tenant.id, email },
      });
      if (emailTaken) {
        throw new UnauthorizedException(`SSO 账号邮箱冲突：${email} 已被占用，请联系管理员`);
      }
      const randomSecret = Math.random().toString(36) + Date.now();
      user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          name: identity.name,
          passwordHash: randomSecret, // 明文随机串，未过 bcrypt —— 密码登录必然失败
          status: 'ACTIVE',
        },
      });
      await prisma.userIdentity.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          provider: 'cas',
          externalId: identity.externalId,
          lastSyncAt: new Date(),
        },
      });
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户已被禁用');
    }

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId },
    };
  }

  private async resolveCasProvider(tenantSlug: string): Promise<CasAuthProvider> {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new UnauthorizedException('租户不存在');
    }
    const row = await this.configService.resolveActiveAuthConfig(tenant.id, 'cas');
    if (!row) {
      throw new UnauthorizedException('该租户未启用 CAS 登录');
    }
    const config = row.config as unknown as CasConfig;
    // service 参数携带 tenant 标识：回调据此定位租户与对应 CAS 配置
    const provider = new CasAuthProvider({
      ...config,
      serviceUrl: `${config.serviceUrl}${config.serviceUrl.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(tenantSlug)}`,
    });
    return provider;
  }
}
