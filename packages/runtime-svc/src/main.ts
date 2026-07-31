import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { RuntimeModule } from './runtime.module.js';

async function bootstrap() {
  const app = await NestFactory.create(RuntimeModule);
  app.setGlobalPrefix('api/runtime');
  app.enableCors({ credentials: true });
  const port = process.env.RUNTIME_SVC_PORT ?? '3002';
  await app.listen(port);
  Logger.log(`⚡ Runtime Service running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
