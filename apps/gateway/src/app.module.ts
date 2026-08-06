import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ApplicationModule } from './application/application.module.js';
import { ObjectModule } from './object/object.module.js';
import { RecordModule } from './record/record.module.js';
import { PageModule } from './page/page.module.js';
import { ProcessModule } from './process/process.module.js';
import { PermissionModule } from './permission/permission.module.js';
import { QueueModule } from './queue/queue.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { HealthController } from './health.controller.js';
import { envValidation } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidation,
    }),
    AuthModule,
    TenantModule,
    ApplicationModule,
    ObjectModule,
    RecordModule,
    PageModule,
    ProcessModule,
    PermissionModule,
    QueueModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
