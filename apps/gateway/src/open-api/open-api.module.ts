import { Module } from '@nestjs/common';
import { OpenApiController } from './open-api.controller.js';
import { ProcessApiReleaseController } from './process-api-release.controller.js';
import { ProcessApiReleaseService } from './process-api-release.service.js';
import { ServiceIdentityModule } from '../service-identity/service-identity.module.js';
import { ProcessModule } from '../process/process.module.js';
import { PermissionModule } from '../permission/permission.module.js';
import { AppAccessModule } from '../app-access/app-access.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';

/**
 * 开放 API 模块（G6）——纯流程触发的公开端点 + 版本发布管理。
 */
@Module({
  imports: [
    ServiceIdentityModule,
    ProcessModule,
    PermissionModule,
    AppAccessModule,
    ObservabilityModule,
  ],
  controllers: [OpenApiController, ProcessApiReleaseController],
  providers: [ProcessApiReleaseService],
  exports: [ProcessApiReleaseService],
})
export class OpenApiModule {}
