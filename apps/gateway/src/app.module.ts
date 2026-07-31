import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ApplicationModule } from './application/application.module.js';
import { ObjectModule } from './object/object.module.js';
import { RecordModule } from './record/record.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ApplicationModule,
    ObjectModule,
    RecordModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
