/**
 * 连接器模块 — 连接器 CRUD + 凭证管理 + Webhook 接收 + 调用引擎。
 */

import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConnectorController } from './connector.controller.js';
import { ConnectorService } from './connector.service.js';
import { ConnectorCallService } from './connector-call.service.js';
import { DesignConnectorController } from './design-connector.controller.js';
import { DesignCredentialController } from './design-credential.controller.js';
import { CredentialService } from './credential.service.js';
import { WebhookController } from './webhook.controller.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';
import { ChangeLogModule } from '../application/changelog.module.js';
import { ProcessModule } from '../process/process.module.js';

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
    ChangeLogModule,
    forwardRef(() => ProcessModule),
  ],
  controllers: [
    ConnectorController,
    DesignConnectorController,
    DesignCredentialController,
    WebhookController,
  ],
  providers: [ConnectorService, ConnectorCallService, CredentialService, JwtStrategy],
  exports: [ConnectorService, ConnectorCallService, CredentialService],
})
export class ConnectorModule {}
