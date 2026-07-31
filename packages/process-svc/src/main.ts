import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ProcessModule } from './process.module.js';

async function bootstrap() {
  const app = await NestFactory.create(ProcessModule);
  app.setGlobalPrefix('api/process');
  app.enableCors({ credentials: true });
  const port = process.env.PROCESS_SVC_PORT ?? '3003';
  await app.listen(port);
  Logger.log(`⚙️  Process Service running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
