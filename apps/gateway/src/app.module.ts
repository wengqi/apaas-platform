import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { ApplicationModule } from './application/application.module.js';
import { ObjectModule } from './object/object.module.js';
import { RecordModule } from './record/record.module.js';
import { PageModule } from './page/page.module.js';
import { ProcessModule } from './process/process.module.js';
import { PermissionModule } from './permission/permission.module.js';
import { QueueModule } from './queue/queue.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { ConnectorModule } from './connector/connector.module.js';
import { DatasetModule } from './dataset/dataset.module.js';
import { CloudFunctionModule } from './cloud-function/cloud-function.module.js';
import { HealthController } from './health.controller.js';
import { envValidation } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidation,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
    AuthModule,
    TenantModule,
    ApplicationModule,
    ObjectModule,
    RecordModule,
    PageModule,
    ProcessModule,
    PermissionModule,
    QueueModule,
    ConnectorModule,
    DatasetModule,
    CloudFunctionModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
