import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { IdentityModule } from './identity/identity.module.js';
import { SchemaContractModule } from './schema-contract/schema-contract.module.js';
import { HealthController } from './health.controller.js';
import { TenantContextInterceptor } from './common/tenant-context.interceptor.js';
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
        // 评审 M-5：webhook 路径含长期 token，访问日志不记录该路径
        autoLogging: {
          ignore: (req) => Boolean(req.url?.includes('/webhooks/')),
        },
      },
    }),
    // 限流阈值从环境变量读取（THROTTLE_TTL_MS / THROTTLE_DEFAULT_LIMIT / THROTTLE_AUTH_LIMIT），
    // E2E 测试等高吞吐场景可调高避免 429 干扰
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL_MS) || 60_000,
        limit: Number(process.env.THROTTLE_DEFAULT_LIMIT) || 100,
      },
      {
        name: 'auth',
        ttl: Number(process.env.THROTTLE_TTL_MS) || 60_000,
        limit: Number(process.env.THROTTLE_AUTH_LIMIT) || 10,
      },
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
    IdentityModule,
    SchemaContractModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
