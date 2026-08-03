/**
 * 通知模块 — 邮件 + 站内信服务。
 *
 * 提供：
 * - MailService：SMTP 邮件发送（nodemailer 动态导入）
 * - InAppMessageService：站内消息 CRUD
 * - InAppMessageController：站内信 API（列表/未读数/标记已读）
 *
 * 被 ProcessModule 导入，供 NotificationExecutor 使用。
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { MailService } from './mail.service.js';
import { InAppMessageService } from './in-app-message.service.js';
import { InAppMessageController } from './in-app-message.controller.js';

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
  controllers: [InAppMessageController],
  providers: [MailService, InAppMessageService, JwtStrategy],
  exports: [MailService, InAppMessageService],
})
export class NotificationModule {}
