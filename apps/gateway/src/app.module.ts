import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppThrottlerGuard } from './common/app-throttler.guard.js';
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
import { ReviewModule } from './review/review.module.js';
import { ServiceIdentityModule } from './service-identity/service-identity.module.js';
import { OpenApiModule } from './open-api/open-api.module.js';
import { EnvironmentCoreModule } from './environment/environment-core.module.js';
import { EnvironmentModule } from './environment/environment.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { HealthController } from './health.controller.js';
import { TenantContextInterceptor } from './common/tenant-context.interceptor.js';
import { TraceMiddleware } from './common/trace/trace.middleware.js';
import { getTraceId } from './common/trace/trace-context.js';
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
        // 事件链路 ID（P1 运维治理）：采纳外部 X-Trace-Id（跨服务串联）或生成 UUID，
        // 同一 ID 贯穿 pino 日志行（reqId）+ 审计/观测事件（ALS）+ 错误响应体
        genReqId: (req, res) => {
          const header = req.headers['x-trace-id'];
          const incoming = typeof header === 'string' ? header : header?.[0];
          const id = incoming && incoming.length > 0 ? incoming.slice(0, 128) : randomUUID();
          res.setHeader('X-Trace-Id', id);
          return id;
        },
        // 每条业务日志附带 traceId（请求 ALS 上下文内；后台任务/启动期为空不落字段）
        mixin: () => {
          const traceId = getTraceId();
          return traceId ? { traceId } : {};
        },
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
      {
        // G6 开放 API（/api/v1/open/*，X-API-Key 外部调用）
        name: 'open',
        ttl: Number(process.env.THROTTLE_TTL_MS) || 60_000,
        limit: Number(process.env.THROTTLE_OPEN_LIMIT) || 120,
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
    ReviewModule,
    EnvironmentCoreModule,
    EnvironmentModule,
    ServiceIdentityModule,
    OpenApiModule,
    McpModule,
    ObservabilityModule,
  ],
  controllers: [HealthController],
  providers: [
    // 限流维度：认证请求按用户/令牌分桶、匿名按 IP（默认 ThrottlerGuard 按 IP
    // 使 localhost 多客户端共享单桶，R5.5 实测多账号并发触发 429 打断提交流程）
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  // TraceMiddleware 全局最前置（pino-http 之后、路由之前），建立 traceId ALS 上下文
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
