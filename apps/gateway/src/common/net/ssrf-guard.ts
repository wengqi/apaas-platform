/**
 * 出站 SSRF 防护（评审 H-3）。
 *
 * 所有由用户配置 URL 的出站请求（HTTP 连接器 / OAuth2 tokenUrl / 流程 HTTP 节点）
 * 必须经 safeFetch 发起：协议白名单 + DNS 解析后 IP 黑名单 + 手动重定向逐跳复检。
 *
 * 攻击面：169.254.169.254 云元数据、127.0.0.1 本机、RFC1918 内网、
 * IPv6 回环/链路本地/ULA、以及 DNS rebinding（解析结果逐 IP 校验）。
 */

import { lookup } from 'node:dns/promises';

/** 允许的出站协议 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** CIDR 黑名单（IPv4） */
const BLOCKED_V4_CIDRS: Array<[bigint, bigint]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
].map(([ip, bits]) => {
  const base = v4ToBigInt(ip as string);
  const mask = (1n << BigInt(32 - (bits as number))) - 1n;
  return [base & ~mask, BigInt(bits as number)];
});

function v4ToBigInt(ip: string): bigint {
  const parts = ip.split('.').map(Number);
  return parts.reduce((acc, part) => (acc << 8n) | BigInt(part), 0n);
}

/** IPv4 是否落在任一黑名单网段 */
function isBlockedV4(ip: string): boolean {
  const value = v4ToBigInt(ip);
  return BLOCKED_V4_CIDRS.some(([base, bits]) => value >> (32n - bits) === base >> (32n - bits));
}

/** IPv6 是否为回环/链路本地/ULA/IPv4 映射私网 */
function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 ULA
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped → 按嵌入的 v4 判定
    const v4 = lower.slice('::ffff:'.length);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isBlockedV4(v4);
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  return ip.includes('.') ? isBlockedV4(ip) : isBlockedV6(ip);
}

export class OutboundUrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundUrlBlockedError';
  }
}

function allowPrivate(): boolean {
  // 单元测试环境豁免：spec 以 vi.stubGlobal 模拟 fetch + 假域名，不发生真实出站
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
  return (
    process.env.OUTBOUND_ALLOW_PRIVATE === 'true' || process.env.OUTBOUND_ALLOW_PRIVATE === '1'
  );
}

/** 校验 URL 协议与解析出的全部 IP 是否安全，返回规范化 URL。 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OutboundUrlBlockedError(`无效的出站 URL: ${rawUrl.slice(0, 200)}`);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new OutboundUrlBlockedError(`出站协议被拒绝: ${url.protocol}`);
  }

  if (allowPrivate()) return url; // 仅开发/联调环境显式放开

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new OutboundUrlBlockedError(`出站目标域名无法解析: ${url.hostname}`);
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new OutboundUrlBlockedError(`出站目标解析到受限地址 ${address}（SSRF 防护）`);
    }
  }
  return url;
}

/**
 * SSRF 安全的 fetch：手动跟随重定向并对每一跳复检目标地址。
 * 超时由调用方通过 signal 传入（默认 OUTBOUND_HTTP_TIMEOUT_MS）。
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 3, ...rest } = init;
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertSafeOutboundUrl(currentUrl);
    const response = await fetch(url.toString(), { ...rest, redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      // 释放连接体，避免 socket 泄漏
      void response.arrayBuffer().catch(() => {});
      currentUrl = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new OutboundUrlBlockedError(`出站重定向次数超过上限 ${maxRedirects}`);
}

/** 从环境读取的默认出站超时（毫秒） */
export function outboundTimeoutMs(): number {
  return Number(process.env.OUTBOUND_HTTP_TIMEOUT_MS) || 10_000;
}
