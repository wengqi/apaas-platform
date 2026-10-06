/**
 * NotificationExecutor EMAIL 渠道单测（影响矩阵缺口②，2026-10-06）。
 *
 * 覆盖边界：渠道分派 + {{var}} 渲染 + MailService 调用契约；
 * SMTP 传输本身是 nodemailer 的职责（MailService 未配置时降级 false 不抛）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationExecutor } from './notification.executor.js';
import { MailService } from '../../notification/mail.service.js';
import { InAppMessageService } from '../../notification/in-app-message.service.js';
import { getMockPrisma } from '../../test/test-helpers.js';

function makeExecutor() {
  const mailService = { sendMail: vi.fn().mockResolvedValue(true) };
  const inAppMessageService = { create: vi.fn().mockResolvedValue(1) };
  const executor = new NotificationExecutor(
    mailService as unknown as MailService,
    inAppMessageService as unknown as InAppMessageService,
  );
  return { executor, mailService, inAppMessageService };
}

function ctx(node: {
  id: string;
  data: Record<string, unknown>;
  variables?: Record<string, unknown>;
}) {
  return {
    node: { id: node.id, type: 'notification', data: node.data },
    inputs: {},
    variables: node.variables ?? { record: { created_by: 'user-u1', status: 'rejected' } },
    tenantId: 't-1',
    appId: 'app-1',
    instance: { id: 'pi-1' },
    nodeExecutionId: 'ne-1',
    environmentId: 'prod',
  } as never;
}

describe('NotificationExecutor — EMAIL 渠道（影响矩阵缺口②）', () => {
  beforeEach(() => {
    const db = getMockPrisma();
    db.notificationTemplate.findFirst.mockResolvedValue(null);
  });

  it('EMAIL 渠道：sendMail 以渲染后的收件人/标题/正文调用', async () => {
    const { executor, mailService } = makeExecutor();
    const r = await executor.execute(
      ctx({
        id: 'n1',
        data: {
          channel: 'EMAIL',
          recipients: ['{{record.created_by}}', 'boss@apaas.dev'],
          title: '反馈审批被驳回',
          content: '您提交的 {{record.status}} 反馈已被驳回',
        },
      }),
    );
    expect(mailService.sendMail).toHaveBeenCalledOnce();
    expect(mailService.sendMail).toHaveBeenCalledWith({
      to: ['user-u1', 'boss@apaas.dev'],
      subject: '反馈审批被驳回',
      html: '您提交的 rejected 反馈已被驳回',
    });
    expect(r.output).toMatchObject({ success: true, channel: 'EMAIL' });
  });

  it('MailService 降级（SMTP 未配置返回 false）→ success=false 不抛异常', async () => {
    const { executor, mailService } = makeExecutor();
    mailService.sendMail.mockResolvedValue(false);
    const r = await executor.execute(
      ctx({
        id: 'n2',
        data: { channel: 'EMAIL', recipients: ['a@x.dev'], title: 't', content: 'c' },
      }),
    );
    expect(r.output).toMatchObject({ success: false, channel: 'EMAIL' });
  });

  it('模板解析为空收件人 → 跳过 sendMail、success=false（与 IN_APP/WEBHOOK 一致）', async () => {
    const { executor, mailService } = makeExecutor();
    const r = await executor.execute(
      ctx({
        id: 'n3',
        data: { channel: 'EMAIL', recipients: ['{{record.missing}}'], title: 't', content: 'c' },
      }),
    );
    expect(mailService.sendMail).not.toHaveBeenCalled();
    expect(r.output).toMatchObject({ success: false, recipients: [] });
  });
});
