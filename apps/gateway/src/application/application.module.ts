import { Module } from '@nestjs/common';
import { ApplicationService } from './application.service.js';
import { ApplicationController } from './application.controller.js';
import { SnapshotService } from './snapshot.service.js';
import { CheckService } from './check.service.js';
import { ChangeLogService } from './changelog.service.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';

/**
 * 应用模块 — Application CRUD + 发布/预检/版本管理。
 * 独立持有 JwtModule + JwtStrategy，使 Application 路由可受 JWT 保护。
 * 导入 PermissionModule 使 PermissionGuard 可注入。
 *
 * 依赖图（无循环）：
 *   ApplicationService → {SnapshotService, CheckService, ChangeLogService}
 *   CheckService → SnapshotService
 *   ChangeLogService → (无，直接用 prisma)
 *   ApplicationController → {ApplicationService, ChangeLogService}
 */
@Module({
  imports: [
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
  ],
  controllers: [ApplicationController],
  providers: [
    ApplicationService,
    SnapshotService,
    CheckService,
    ChangeLogService,
    JwtStrategy,
  ],
  exports: [ApplicationService, ChangeLogService],
})
export class ApplicationModule {}
