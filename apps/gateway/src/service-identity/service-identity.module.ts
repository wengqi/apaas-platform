import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ServiceIdentityController } from './service-identity.controller.js';
import { PermissionModule } from '../permission/permission.module.js';
import { AppAccessModule } from '../app-access/app-access.module.js';

/**
 * 服务身份模块（G6）——入站 API Key 的管理（JWT 面）与校验（ApiKeyGuard）。
 * ApiKeyGuard 供 open-api 模块的公开控制器使用。
 */
@Module({
  imports: [PermissionModule, AppAccessModule],
  controllers: [ServiceIdentityController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ServiceIdentityModule {}
