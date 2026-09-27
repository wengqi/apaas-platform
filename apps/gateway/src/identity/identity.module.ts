/**
 * 企业身份对接模块 — CAS SSO / LDAP·人力主数据目录同步 / 租户级对接配置。
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { IdentityController } from './identity.controller.js';
import { SsoService } from './sso.service.js';
import { IdentityConfigService } from './identity-config.service.js';
import { DirectorySyncService } from './directory-sync.service.js';

@Module({
  imports: [AuthModule], // 复用 JwtModule（SSO 回调签发平台 JWT）与 TenantAdminGuard
  controllers: [IdentityController],
  providers: [SsoService, IdentityConfigService, DirectorySyncService],
  exports: [DirectorySyncService],
})
export class IdentityModule {}
