import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // 全局前缀
  app.setGlobalPrefix('api');

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS（前端 Studio/Runtime UI 跨域）
  // Docker 部署通过 nginx 同源代理，不触发 CORS；此处保留 dev 模式默认值
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : ['http://localhost:5173', 'http://localhost:5174']; // dev 默认
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = process.env.GATEWAY_PORT ?? '3000';
  await app.listen(port);
  Logger.log(`🚀 API Gateway running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
