import { Module } from '@nestjs/common';
import { ObjectService } from './object.service.js';
import { ObjectController } from './object.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';

/**
 * 对象模块 — 对象元数据 / 字段 / 视图 CRUD。
 * 独立持有 JwtModule + JwtStrategy，使对象路由可受 JWT 保护。
 * 导入 PermissionModule 使 PermissionGuard 可注入。
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
    PermissionModule,
  ],
  controllers: [ObjectController],
  providers: [ObjectService, JwtStrategy],
  exports: [ObjectService],
})
export class ObjectModule {}
