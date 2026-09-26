import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // 结构化日志（pino JSON 格式，生产环境自动启用）
  app.useLogger(app.get(Logger));

  // HTTP 安全头
  app.use(helmet());

  // 全局前缀
  app.setGlobalPrefix('api');

  // API 版本控制（URI 版本，路由变为 /api/v1/...）
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 全局异常过滤器（Prisma 异常转译优先，兜底所有未捕获异常）
  app.useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter());

  // CORS（前端 Studio/Runtime UI 跨域）
  // Docker 部署通过 nginx 同源代理，不触发 CORS；此处保留 dev 模式默认值
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim());
  if (corsOrigins?.length) {
    app.enableCors({ origin: corsOrigins, credentials: true });
  } else if (!isProduction) {
    // 开发默认（评审 L-6：生产缺省不得回退 dev 值——同源 nginx 部署无需 CORS）
    app.enableCors({
      origin: ['http://localhost:5173', 'http://localhost:5174'],
      credentials: true,
    });
  }

  // Swagger API 文档（评审 M-6：生产环境不暴露 API 结构）
  if (isProduction) {
    const port = process.env.GATEWAY_PORT ?? '3000';
    await app.listen(port);
    app.get(Logger).log(`🚀 API Gateway running on http://localhost:${port}`, 'Bootstrap');
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('aPaaS Gateway API')
    .setDescription('飞书 aPaaS 低代码平台 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.GATEWAY_PORT ?? '3000';
  await app.listen(port);
  app
    .get(Logger)
    .log(`🚀 API Gateway running on http://localhost:${port} (docs: /api/docs)`, 'Bootstrap');
}

void bootstrap();
