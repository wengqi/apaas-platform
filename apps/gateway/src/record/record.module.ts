import { Module } from '@nestjs/common';
import { RecordService } from './record.service.js';
import { RecordController } from './record.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';

/**
 * 记录模块 — 基于 JSONB 宽表的记录 CRUD。
 * 独立持有 JwtModule + JwtStrategy，使记录路由可受 JWT 保护。
 * 模式同 ApplicationModule。
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  controllers: [RecordController],
  providers: [RecordService, JwtStrategy],
  exports: [RecordService],
})
export class RecordModule {}
