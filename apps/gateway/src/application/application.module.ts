import { Module } from '@nestjs/common';
import { ApplicationService } from './application.service.js';
import { ApplicationController } from './application.controller.js';
import { SnapshotService } from './snapshot.service.js';
import { CheckService } from './check.service.js';
import { ChangeLogModule } from './changelog.module.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';
import { SchemaContractModule } from '../schema-contract/schema-contract.module.js';
import { ProcessModule } from '../process/process.module.js';
import { EnvironmentModule } from '../environment/environment.module.js';

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
 *
 * ChangeLogService 通过 ChangeLogModule 导入，供其他模块复用。
 */
@Module({
  imports: [
    // 评审 P1-7：应用级发布需要为 SCHEDULED 流程注册定时触发器（TriggerService）
    ProcessModule,
    // R1.4：应用发布 = 部署到 prod 环境（切指针 + Deployment 历史）
    EnvironmentModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [
        // 评审 P1-7：应用级发布需要为 SCHEDULED 流程注册定时触发器（TriggerService）
        ProcessModule,
        ConfigModule,
      ],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
    PermissionModule,
    ChangeLogModule,
    // 预检页面渲染契约软告警消费 G3 校验器（R6 两缺口 warning）
    SchemaContractModule,
  ],
  controllers: [ApplicationController],
  providers: [ApplicationService, SnapshotService, CheckService, JwtStrategy],
  exports: [ApplicationService],
})
export class ApplicationModule {}
