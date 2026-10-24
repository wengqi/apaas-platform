/**
 * NotificationExecutor WEBHOOK 渠道单测（对抗审查 security-01 回归，2026-10-23）。
 *
 * 缺陷：sendWebhook 曾用裸 fetch 出站，绕过全平台 SSRF 防护契约——recipients 支持
 * {{record.*}} 记录字段插值（终端用户可控 URL），可将引擎出站指向内网/云元数据。
 * 修复：出站改经 safeFetch（协议白名单 + IP 黑名单 + 逐跳复检）+ 超时。
 * 本 spec 钉住两条不变量：①出站必经 safeFetch（禁裸 fetch 回归）；
 * ②safeFetch 拒绝（OutboundUrlBlockedError）→ 节点 success=false 不抛异常。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationExecutor } from './notification.executor.js';
import { MailService } from '../../notification/mail.service.js';
import { InAppMessageService } from '../../notification/in-app-message.service.js';
import { getMockPrisma } from '../../test/test-helpers.js';

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));

vi.mock('../../common/net/ssrf-guard.js', () => ({
  safeFetch: safeFetchMock,
  outboundTimeoutMs: () => 5000,
}));

function makeExecutor() {
  const mailService = { sendMail: vi.fn().mockResolvedValue(true) };
  const inAppMessageService = { create: vi.fn().mockResolvedValue(1) };
  const executor = new NotificationExecutor(
    mailService as unknown as MailService,
    inAppMessageService as unknown as InAppMessageService,
  );
  return { executor };
}

function ctx(data: Record<string, unknown>) {
  return {
    node: { id: 'n1', type: 'notification', data },
    inputs: {},
    variables: { record: { callback_url: 'http://hook.example.dev/notify' } },
    tenantId: 't-1',
    appId: 'app-1',
    instance: { id: 'pi-1' },
    nodeExecutionId: 'ne-1',
    environmentId: 'prod',
  } as never;
}

describe('NotificationExecutor — WEBHOOK 渠道（SSRF 防护回归）', () => {
  beforeEach(() => {
    const db = getMockPrisma();
    db.notificationTemplate.findFirst.mockResolvedValue(null);
    safeFetchMock.mockReset();
  });

  it('WEBHOOK 渠道：经 safeFetch 以渲染后的 URL 发起 POST（携带超时 signal），不走裸 fetch', async () => {
    safeFetchMock.mockResolvedValue({ ok: true });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { executor } = makeExecutor();
    const r = await executor.execute(
      ctx({
        channel: 'WEBHOOK',
        recipients: ['{{record.callback_url}}'],
        title: '审批通过',
        content: '单据已通过',
      }),
    );
    expect(safeFetchMock).toHaveBeenCalledOnce();
    expect(safeFetchMock).toHaveBeenCalledWith(
      'http://hook.example.dev/notify',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.output).toMatchObject({ success: true, channel: 'WEBHOOK' });
  });

  it('safeFetch 拒绝（OutboundUrlBlockedError，如内网地址）→ success=false 不抛异常', async () => {
    safeFetchMock.mockRejectedValue(new Error('出站目标解析到受限地址 127.0.0.1（SSRF 防护）'));
    const { executor } = makeExecutor();
    const r = await executor.execute(
      ctx({
        channel: 'WEBHOOK',
        recipients: ['http://127.0.0.1:9999/pwned'],
        title: 't',
        content: 'c',
      }),
    );
    expect(r.output).toMatchObject({ success: false, channel: 'WEBHOOK' });
  });

  it('safeFetch 返回非 2xx（resp.ok=false）→ success=false', async () => {
    safeFetchMock.mockResolvedValue({ ok: false });
    const { executor } = makeExecutor();
    const r = await executor.execute(
      ctx({
        channel: 'WEBHOOK',
        recipients: ['http://hook.example.dev/500'],
        title: 't',
        content: 'c',
      }),
    );
    expect(r.output).toMatchObject({ success: false, channel: 'WEBHOOK' });
  });

  it('空收件人（URL 缺失）→ 不发起出站、success=false', async () => {
    const { executor } = makeExecutor();
    const r = await executor.execute(
      ctx({ channel: 'WEBHOOK', recipients: ['{{record.missing}}'], title: 't', content: 'c' }),
    );
    expect(safeFetchMock).not.toHaveBeenCalled();
    expect(r.output).toMatchObject({ success: false, recipients: [] });
  });
});
