/**
 * SSRF guard 单元测试 — P1-11 DNS TOCTOU 钉连接（对抗审查 R1-security-05/R2-security-08）。
 *
 * 缺陷：assertSafeOutboundUrl 校验用 lookup() 解析一次，随后 fetch(url) 让 undici
 * 重新解析——权威 DNS 两次应答不同 IP 时校验被穿透（R2 实证 127.0.0.1 收包）。
 * 修复契约：校验通过后，fetch 必须携带钉定已解析 IP 的 dispatcher（undici Agent
 * 自定义 connect.lookup），每一跳重定向重新解析并更新钉定。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import * as http from 'node:http';
import { lookup } from 'node:dns/promises';
import { safeFetch, OutboundUrlBlockedError } from './ssrf-guard.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const lookupMock = lookup as unknown as ReturnType<typeof vi.fn>;

describe('safeFetch — P1-11 校验后钉连接', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('校验通过后 fetch 必须携带钉定解析 IP 的 dispatcher', async () => {
    // 退出 vitest 的 allowPrivate 测试豁免（VITEST=1 恒真），走真实校验路径
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OUTBOUND_ALLOW_PRIVATE', 'false');
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await safeFetch('http://public.example.com/x');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as Record<string, unknown> | undefined;
    expect(init?.dispatcher).toBeDefined();
  });

  it('解析到受限地址仍然拒绝（既有防护不回归）', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OUTBOUND_ALLOW_PRIVATE', 'false');
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(safeFetch('http://evil.example.com/')).rejects.toThrow(OutboundUrlBlockedError);
  });

  it('重定向每一跳重新解析，且后续跳仍携带钉定 dispatcher', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OUTBOUND_ALLOW_PRIVATE', 'false');
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://public2.example.com/y' },
        }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await safeFetch('http://public.example.com/x');

    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1]![1] as Record<string, unknown> | undefined;
    expect(secondInit?.dispatcher).toBeDefined();
  });

  it('钉定 dispatcher 的 lookup 契约真实生效（真实 undici + 本地回环集成）', async () => {
    // 真实 http server 监听 127.0.0.1 随机端口；URL 主机名用不可解析的假域名——
    // 只有当 Agent 真的咨询了我们的钉定 lookup 并连接到已解析 IP 时请求才会成功。
    // 这是对 undici connect.lookup 回调契约（all:true / 单地址两种形态）的实证。
    const server = http.createServer((_req, res) => {
      res.end('pinned-ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const { buildPinnedDispatcher } = await import('./ssrf-guard.js');
      const dispatcher = buildPinnedDispatcher('pinned-fake-host.example', [
        { address: '127.0.0.1', family: 4 },
      ]);
      const res = await fetch(`http://pinned-fake-host.example:${port}/`, {
        dispatcher,
      } as never);
      expect(await res.text()).toBe('pinned-ok');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
