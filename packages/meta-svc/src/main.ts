import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MetaModule } from './meta.module.js';

async function bootstrap() {
  const app = await NestFactory.create(MetaModule);
  app.setGlobalPrefix('api/meta');
  app.enableCors({ credentials: true });
  const port = process.env.META_SVC_PORT ?? '3001';
  await app.listen(port);
  Logger.log(`📦 Meta Service running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
