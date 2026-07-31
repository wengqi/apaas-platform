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
  app.enableCors({
    origin: [
      'http://localhost:5173', // Studio
      'http://localhost:5174', // Runtime UI
    ],
    credentials: true,
  });

  const port = process.env.GATEWAY_PORT ?? '3000';
  await app.listen(port);
  Logger.log(`🚀 API Gateway running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
