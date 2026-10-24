/**
 * WebhookController 单元测试 — P1-12 HMAC 纳入时间戳 + P1-16 绑定触发。
 *
 * P1-12（对抗审查 R2-security-02）：签名输入此前仅 rawBody，时间戳头独立校验——
 * 捕获一次合法签名后刷新时间戳头即可无限重放。修复契约：签名输入改为
 * `${ts}.${rawBody}`，旧格式签名一律拒绝。
 * P1-16（对抗审查 R1-compat-02，用户裁决=Connector 加列 processDefId）：
 * 此前按应用广播（全部 WEBHOOK 已发布流程），新增第二个 WEBHOOK 流程后存量 URL
 * 静默多触发。修复契约：未绑定→不触发任何流程；已绑定→只触发绑定流程（不回退广播）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WebhookController } from './webhook.controller.js';
import { getMockPrisma } from '../test/test-helpers.js';

const TENANT = 'tenant-001';
const APP = 'app-001';
const SECRET = 'whsec-test-secret';
const TOKEN = 'tok-123';

function makeConnector(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-001',
    tenantId: TENANT,
    appId: APP,
    name: '入站 Webhook',
    type: 'WEBHOOK',
    status: 'ACTIVE',
    webhookToken: TOKEN,
    processDefId: null as string | null,
    config: { allowedMethods: ['POST'], webhookSecret: SECRET },
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  const body = { event: 'deploy', ref: 'main' };
  const rawBody = Buffer.from(JSON.stringify(body));
  return { body, rawBody, req: { method: 'POST', headers: {}, rawBody, body, ...overrides } };
}

function signLegacy(secret: string, rawBody: Buffer): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function signWithTimestamp(secret: string, ts: number, rawBody: Buffer): string {
  return createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
}

function createService() {
  const connectorService = {
    findByWebhookToken: vi.fn(),
  };
  const processService = {
    startInstance: vi.fn().mockResolvedValue({ id: 'pi-new' }),
  };
  const controller = new WebhookController(connectorService as never, processService as never);
  return { controller, connectorService, processService };
}

describe('WebhookController（P1-12 + P1-16）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // P1-12 HMAC 纳入时间戳
  // =========================================================================

  it('P1-12：旧格式签名（仅 rawBody，未纳入 ts）→ 403 拒绝', async () => {
    const { controller, connectorService, processService } = createService();
    connectorService.findByWebhookToken.mockResolvedValue(makeConnector());
    const { body, rawBody } = makeRequest();
    const legacySig = signLegacy(SECRET, rawBody);
    const { req } = makeRequest({
      headers: {
        'x-apaas-signature': legacySig,
        'x-apaas-timestamp': String(Date.now()),
      },
    });

    await expect(controller.receive(TOKEN, req as never, body)).rejects.toThrow(ForbiddenException);
    expect(processService.startInstance).not.toHaveBeenCalled();
  });

  it('P1-12：新格式签名 `${ts}.${rawBody}` → 放行并触发', async () => {
    const { controller, connectorService, processService } = createService();
    connectorService.findByWebhookToken.mockResolvedValue(makeConnector({ processDefId: 'pd-1' }));
    const ts = Date.now();
    const { body, rawBody } = makeRequest();
    const sig = signWithTimestamp(SECRET, ts, rawBody);
    const { req } = makeRequest({
      headers: {
        'x-apaas-signature': sig,
        'x-apaas-timestamp': String(ts),
      },
    });
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      tenantId: TENANT,
      appId: APP,
      name: 'Webhook 流',
      status: 'PUBLISHED',
      triggerType: 'WEBHOOK',
    });

    const res = await controller.receive(TOKEN, req as never, body);

    expect(processService.startInstance).toHaveBeenCalledTimes(1);
    expect(res).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ message: expect.stringContaining('1 个流程') }),
      }),
    );
  });

  it('P1-12：合法签名但时间戳超出 5 分钟窗口 → 403（防重放窗口不回归）', async () => {
    const { controller, connectorService, processService } = createService();
    connectorService.findByWebhookToken.mockResolvedValue(makeConnector());
    const stale = Date.now() - 6 * 60 * 1000;
    const { body, rawBody } = makeRequest();
    const sig = signWithTimestamp(SECRET, stale, rawBody);
    const { req } = makeRequest({
      headers: {
        'x-apaas-signature': sig,
        'x-apaas-timestamp': String(stale),
      },
    });

    await expect(controller.receive(TOKEN, req as never, body)).rejects.toThrow(ForbiddenException);
    expect(processService.startInstance).not.toHaveBeenCalled();
  });

  it('token 不存在 → 404（既有语义）', async () => {
    const { controller, connectorService } = createService();
    connectorService.findByWebhookToken.mockResolvedValue(null);
    const { body, req } = makeRequest();

    await expect(controller.receive('missing', req as never, body)).rejects.toThrow(
      NotFoundException,
    );
  });

  // =========================================================================
  // P1-16 绑定触发（不再应用级广播）
  // =========================================================================

  it('P1-16：连接器未绑定流程 → 不触发任何流程，返回未绑定提示', async () => {
    const { controller, connectorService, processService } = createService();
    // 无 webhookSecret：隔离 P1-12 校验，单测绑定语义
    connectorService.findByWebhookToken.mockResolvedValue(
      makeConnector({ processDefId: null, config: { allowedMethods: ['POST'] } }),
    );
    const { body, req } = makeRequest();

    const res = await controller.receive(TOKEN, req as never, body);

    expect(prisma.processDef.findMany).not.toHaveBeenCalled();
    expect(processService.startInstance).not.toHaveBeenCalled();
    expect(res).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ message: expect.stringContaining('未绑定') }),
      }),
    );
  });

  it('P1-16：已绑定 → 只触发绑定流程（即使应用下存在多个 WEBHOOK 流程也不广播）', async () => {
    const { controller, connectorService, processService } = createService();
    connectorService.findByWebhookToken.mockResolvedValue(makeConnector({ processDefId: 'pd-1' }));
    const ts = Date.now();
    const { body, rawBody } = makeRequest();
    const sig = signWithTimestamp(SECRET, ts, rawBody);
    const { req } = makeRequest({
      headers: {
        'x-apaas-signature': sig,
        'x-apaas-timestamp': String(ts),
      },
    });
    // 绑定流程存活（WEBHOOK + PUBLISHED + 同应用）
    prisma.processDef.findFirst.mockResolvedValue({
      id: 'pd-1',
      tenantId: TENANT,
      appId: APP,
      name: 'Webhook 流',
      status: 'PUBLISHED',
      triggerType: 'WEBHOOK',
    });

    await controller.receive(TOKEN, req as never, body);

    expect(prisma.processDef.findMany).not.toHaveBeenCalled();
    expect(processService.startInstance).toHaveBeenCalledTimes(1);
    expect(processService.startInstance).toHaveBeenCalledWith(TENANT, 'pd-1', expect.anything());
  });

  it('P1-16：绑定流程已归档/删除 → 提示未找到已发布流程，不回退到广播', async () => {
    const { controller, connectorService, processService } = createService();
    // 无 webhookSecret：隔离 P1-12 校验，单测绑定语义
    connectorService.findByWebhookToken.mockResolvedValue(
      makeConnector({ processDefId: 'pd-dead', config: { allowedMethods: ['POST'] } }),
    );
    const { body, req } = makeRequest();
    prisma.processDef.findFirst.mockResolvedValue(null);

    const res = await controller.receive(TOKEN, req as never, body);

    expect(processService.startInstance).not.toHaveBeenCalled();
    expect(prisma.processDef.findMany).not.toHaveBeenCalled();
    expect(res).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ message: expect.stringContaining('未发布') }),
      }),
    );
  });
});
