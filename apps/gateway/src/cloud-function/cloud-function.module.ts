/**
 * 云函数模块 — CRUD + 沙箱执行 + 流程节点集成。
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudFunctionController } from './cloud-function.controller.js';
import { CloudFunctionService } from './cloud-function.service.js';
import { CloudFunctionRunner } from './cloud-function.runner.service.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { PermissionModule } from '../permission/permission.module.js';
import { ChangeLogModule } from '../application/changelog.module.js';

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
    ChangeLogModule,
  ],
  controllers: [CloudFunctionController],
  providers: [CloudFunctionService, CloudFunctionRunner, JwtStrategy],
  exports: [CloudFunctionService, CloudFunctionRunner],
})
export class CloudFunctionModule {}
