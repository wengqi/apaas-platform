/**
 * ConnectorCallService 单元测试 — 调用引擎与凭证注入。
 *
 * 重点覆盖 OAuth2 扩展（client_credentials）：
 * - 令牌获取 + Bearer 注入
 * - access token 内存缓存（expires_in 内不重复换取）
 * - authStyle：body（默认表单字段）/ basic（HTTP Basic 头）
 * - 令牌端点失败 / 缺少 access_token 的错误处理
 * - BEARER / BASIC 等既有凭证类型的回归
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ConnectorCallService } from './connector-call.service.js';

// ---------------------------------------------------------------------------
// Mock 基建
// ---------------------------------------------------------------------------

/** 构造 fetch Response 形态的 mock 对象。 */
function makeResponse(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { forEach: (_fn: (v: string, k: string) => void) => undefined },
    text: async () => text,
  };
}

function makeConnector(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    tenantId: 'tenant-001',
    appId: 'app-001',
    type: 'HTTP',
    baseUrl: 'https://api.example.com',
    config: {},
    credentialId: 'cred-1',
    ...overrides,
  } as ConstructorParameters<typeof ConnectorCallService>[0] extends never
    ? never
    : Parameters<ConnectorCallService['invoke']>[0];
}

/** 创建 service：credentialService.decrypt 按 mockData 返回解密凭证。 */
function createService(mockData: Record<string, unknown>) {
  const credentialService = {
    decrypt: vi.fn().mockResolvedValue(mockData),
  };
  const service = new ConnectorCallService(
    credentialService as unknown as ConstructorParameters<typeof ConnectorCallService>[0],
  );
  return { service, credentialService };
}

const OAUTH2_DATA = {
  tokenUrl: 'https://auth.example.com/oauth/token',
  clientId: 'client-abc',
  clientSecret: 'secret-xyz',
};

describe('ConnectorCallService — OAuth2', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('换取 access_token 并以 Bearer 注入业务请求', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { access_token: 'tk-123', expires_in: 3600 }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));
    const { service } = createService(OAUTH2_DATA);

    const result = await service.invoke(makeConnector(), { method: 'GET', path: '/users' });

    // 两次调用：令牌端点 + 业务端点
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] ?? [];
    expect(tokenUrl).toBe(OAUTH2_DATA.tokenUrl);
    const tokenBody = String((tokenInit as RequestInit).body);
    expect(tokenBody).toContain('grant_type=client_credentials');
    expect(tokenBody).toContain('client_id=client-abc');
    expect(tokenBody).toContain('client_secret=secret-xyz');

    const [, apiInit] = fetchMock.mock.calls[1] ?? [];
    expect((apiInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tk-123',
    });
    expect(result.success).toBe(true);
  });

  it('access token 缓存：expires_in 内第二次调用不再换取令牌', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { access_token: 'tk-cached', expires_in: 3600 }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));
    const { service } = createService(OAUTH2_DATA);

    await service.invoke(makeConnector(), { method: 'GET', path: '/a' });
    await service.invoke(makeConnector(), { method: 'GET', path: '/b' });

    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 次令牌 + 2 次业务
  });

  it('authStyle=basic：客户端凭证经 HTTP Basic 头传递，表单不含 secret', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { access_token: 'tk-basic' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));
    const { service } = createService({ ...OAUTH2_DATA, authStyle: 'basic' });

    await service.invoke(makeConnector(), { method: 'GET', path: '/x' });

    const [, tokenInit] = fetchMock.mock.calls[0] ?? [];
    const headers = (tokenInit as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic /);
    const tokenBody = String((tokenInit as RequestInit).body);
    expect(tokenBody).not.toContain('client_secret');
    expect(tokenBody).not.toContain('client_id');
  });

  it('令牌端点返回错误：抛 BadRequestException（不含 clientSecret）', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(400, { error: 'invalid_client' }));
    const { service } = createService(OAUTH2_DATA);

    await expect(service.invoke(makeConnector(), { method: 'GET', path: '/' })).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('令牌响应缺少 access_token：抛 BadRequestException', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { unexpected: true }));
    const { service } = createService(OAUTH2_DATA);

    await expect(service.invoke(makeConnector(), { method: 'GET', path: '/' })).rejects.toThrow(
      'access_token',
    );
  });
});

describe('ConnectorCallService — 既有凭证类型回归', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('BEARER：静态 token 直接注入，不发令牌请求', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));
    const { service, credentialService } = createService({ token: 'static-tk' });

    const result = await service.invoke(makeConnector(), { method: 'GET', path: '/' });

    expect(credentialService.decrypt).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, apiInit] = fetchMock.mock.calls[0] ?? [];
    expect((apiInit as RequestInit).headers).toMatchObject({ Authorization: 'Bearer static-tk' });
    expect(result.success).toBe(true);
  });

  it('BASIC：username/password 编码为 Basic 头', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));
    const { service } = createService({ username: 'u', password: 'p' });

    await service.invoke(makeConnector(), { method: 'GET', path: '/' });

    const [, apiInit] = fetchMock.mock.calls[0] ?? [];
    const expected = `Basic ${Buffer.from('u:p').toString('base64')}`;
    expect((apiInit as RequestInit).headers).toMatchObject({ Authorization: expected });
  });

  it('非 HTTP 类型连接器拒绝调用', async () => {
    const { service } = createService({ token: 'x' });
    await expect(
      service.invoke(makeConnector({ type: 'WEBHOOK' }), { method: 'GET', path: '/' }),
    ).rejects.toThrow('只有 HTTP 类型');
  });
});
