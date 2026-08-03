/**
 * 邮件服务 — 封装 nodemailer SMTP 发送。
 *
 * 从环境变量读取 SMTP 配置：
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
 *
 * 未配置 SMTP 时，sendMail 返回 false 并记录警告（不抛异常，不阻塞流程）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailOptions {
  to: string[];
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly smtpConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  } | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM');

    if (host && user && pass) {
      this.smtpConfig = {
        host,
        port: parseInt(port ?? '587', 10),
        user,
        pass,
        from: from ?? user,
      };
    } else {
      this.smtpConfig = null;
      this.logger.warn('SMTP 未配置，邮件发送将跳过（设置 SMTP_HOST/SMTP_USER/SMTP_PASS 启用）');
    }
  }

  /** 是否已配置 SMTP。 */
  get isConfigured(): boolean {
    return this.smtpConfig !== null;
  }

  /**
   * 发送邮件。
   * @returns true=成功, false=失败或未配置
   */
  async sendMail(options: MailOptions): Promise<boolean> {
    if (!this.smtpConfig) {
      this.logger.warn(`[邮件] SMTP 未配置，跳过发送: to=${options.to.join(',')} | ${options.subject}`);
      return false;
    }

    try {
      // 动态导入 nodemailer（避免未安装时启动失败）
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: this.smtpConfig.host,
        port: this.smtpConfig.port,
        auth: {
          user: this.smtpConfig.user,
          pass: this.smtpConfig.pass,
        },
      });

      await transporter.sendMail({
        from: this.smtpConfig.from,
        to: options.to.join(','),
        subject: options.subject,
        html: options.html,
      });

      this.logger.log(`[邮件] 发送成功: to=${options.to.join(',')} | ${options.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`[邮件] 发送失败: ${String(err)}`);
      return false;
    }
  }
}
