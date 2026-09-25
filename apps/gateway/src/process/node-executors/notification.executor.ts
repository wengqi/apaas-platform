/**
 * NotificationExecutor — 发送通知节点。
 *
 * 定位：通过站内信/邮件/Webhook 发送通知，支持通知模版。
 * 配置项（node.data）：
 *   - 内联模式：channel / recipients / title / content
 *   - 模版模式：templateId（加载 NotificationTemplate，渲染 title_template / body_template）
 * 执行逻辑：解析收件人与内容（支持 {{var}} 插值）→ 按渠道发送 → 记录回执。
 *
 * 渠道实现：
 *   - in_app：写入 InAppMessage 表，用户在运行时前端查看
 *   - email：通过 MailService (nodemailer SMTP) 发送
 *   - webhook：HTTP POST 到 recipients[0] 指定的 URL
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { renderTemplateDotted } from '../process-utils.js';
import { MailService } from '../../notification/mail.service.js';
import { InAppMessageService } from '../../notification/in-app-message.service.js';

@Injectable()
export class NotificationExecutor implements NodeExecutor {
  private readonly logger = new Logger(NotificationExecutor.name);
  readonly type = 'notification';

  constructor(
    private readonly mailService: MailService,
    private readonly inAppMessageService: InAppMessageService,
  ) {}

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const channel = (data['channel'] as string) ?? 'IN_APP';
    const templateId =
      (data['templateId'] as string | undefined) ?? (data['template_id'] as string | undefined);

    // 构建渲染作用域：合并 global 到顶层，使 {{applicant}} 与 {{node.output.x}} 均可解析
    const globalVars = (ctx.variables['global'] as Record<string, unknown>) ?? {};
    const renderScope: Record<string, unknown> = { ...ctx.variables, ...globalVars };

    const rawRecipients =
      (data['recipients'] as string[] | undefined) ??
      (ctx.inputs['recipients'] as string[] | undefined) ??
      [];
    // 收件人支持 {{var}} 模板引用（如 {{record.created_by}}），解析后剔除空项
    const recipients = rawRecipients
      .map((r) => renderTemplateDotted(r, renderScope).trim())
      .filter((r) => r.length > 0);
    if (recipients.length === 0) {
      this.logger.warn(
        `通知节点 ${ctx.node.id} 收件人列表为空（recipients 配置为空或模板引用解析为空），通知将不会送达`,
      );
    }

    let title: string;
    let body: string;

    if (templateId) {
      // 模版模式：加载模版并渲染
      const template = await prisma.notificationTemplate.findFirst({
        where: { id: templateId, tenantId: ctx.tenantId },
      });
      if (!template) {
        throw new Error(`通知模版 ${templateId} 不存在`);
      }
      title = renderTemplateDotted(template.titleTemplate, renderScope);
      body = renderTemplateDotted(template.bodyTemplate, renderScope);
    } else {
      // 内联模式
      title = renderTemplateDotted(
        (data['title'] as string) ?? (ctx.inputs['title'] as string) ?? '',
        renderScope,
      );
      body = renderTemplateDotted(
        (data['content'] as string) ??
          (data['body'] as string) ??
          (ctx.inputs['content'] as string) ??
          (ctx.inputs['body'] as string) ??
          '',
        renderScope,
      );
    }

    const messageId = this.generateMessageId();
    let success = true;

    try {
      switch (channel) {
        case 'WEBHOOK':
          success = await this.sendWebhook(recipients, title, body);
          break;
        case 'EMAIL':
          success = await this.mailService.sendMail({
            to: recipients,
            subject: title,
            html: body,
          });
          break;
        case 'IN_APP':
        default: {
          const created = await this.inAppMessageService.create({
            tenantId: ctx.tenantId,
            appId: ctx.appId,
            userIds: recipients,
            title,
            body,
          });
          success = created > 0;
          break;
        }
      }
    } catch (err) {
      success = false;
      this.logger.error(`通知发送失败: ${String(err)}`);
    }

    return {
      output: { messageId, success, channel, recipients, title },
    };
  }

  /** Webhook 渠道：HTTP POST 到 recipients[0] 指定的 URL。 */
  private async sendWebhook(recipients: string[], title: string, body: string): Promise<boolean> {
    const url = recipients[0];
    if (!url) return false;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, timestamp: new Date().toISOString() }),
    });
    return resp.ok;
  }

  private generateMessageId(): string {
    // Node 内置 crypto.randomUUID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
