import { Module } from '@nestjs/common';
import { PageService } from './page.service.js';
import { PageController } from './page.controller.js';
import { DesignPageController } from './design-page.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';
import { AppAccessModule } from '../app-access/app-access.module.js';
import { ChangeLogModule } from '../application/changelog.module.js';
import { EnvironmentCoreModule } from '../environment/environment-core.module.js';
import { SchemaContractModule } from '../schema-contract/schema-contract.module.js';

/**
 * 页面模块 — 页面 Schema 存取 CRUD。
 * 独立持有 JwtModule + JwtStrategy，使页面路由可受 JWT 保护。
 * 导入 PermissionModule 使 PermissionGuard 可注入。
 * 导入 ChangeLogModule 使 PageService 可记录变更。
 */
@Module({
  imports: [
    SchemaContractModule,
    EnvironmentCoreModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
    PermissionModule,
    AppAccessModule,
    ChangeLogModule,
  ],
  controllers: [PageController, DesignPageController],
  providers: [PageService, JwtStrategy],
  exports: [PageService],
})
export class PageModule {}
