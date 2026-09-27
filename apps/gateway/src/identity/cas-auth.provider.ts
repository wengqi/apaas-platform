/**
 * CAS 认证适配器 — 实现 AuthProvider（CAS 2.0/3.0 协议）。
 *
 * 流程：buildLoginUrl 跳转 CAS 登录页 → 回调携 ticket →
 * serviceValidate 校验（XML）→ 解析 username 与属性 → ExternalIdentity。
 * 属性名遵循 CAS 标准命名（cn/mail/employeeNumber），可在 CAS 服务端属性装配调整。
 */

import { UnauthorizedException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import type { AuthProvider, CasConfig, ExternalIdentity } from './external-identity.types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // cas:serviceResponse > cas:authenticationSuccess > cas:user / cas:attributes
  removeNSPrefix: true,
});

/**
 * 解析 CAS /serviceValidate（或 p3/serviceValidate）的 XML 响应。
 * 独立导出便于单测（合法响应 / 认证失败 / 缺 user 三种形态）。
 */
export function parseCasServiceValidateXml(xml: string): {
  user: string;
  attributes: Record<string, string>;
} {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new UnauthorizedException('CAS 响应不是合法 XML');
  }
  const serviceResponse = (doc as Record<string, unknown>)?.serviceResponse as
    Record<string, unknown> | undefined;
  const success = serviceResponse?.authenticationSuccess as Record<string, unknown> | undefined;
  const failure = serviceResponse?.authenticationFailure as unknown;

  const user = success?.user;
  if (typeof user !== 'string' || user.length === 0) {
    const code =
      failure && typeof failure === 'object'
        ? String((failure as Record<string, string>)['@_code'] ?? '')
        : '';
    throw new UnauthorizedException(`CAS 认证失败${code ? `（${code}）` : ''}`);
  }

  const rawAttributes = success?.attributes;
  const attributes: Record<string, string> = {};
  if (rawAttributes && typeof rawAttributes === 'object') {
    for (const [key, value] of Object.entries(rawAttributes as Record<string, unknown>)) {
      if (typeof value === 'string') {
        attributes[key] = value;
      } else if (Array.isArray(value) && typeof value[0] === 'string') {
        attributes[key] = value[0];
      }
    }
  }
  return { user, attributes };
}

export class CasAuthProvider implements AuthProvider {
  readonly type = 'cas' as const;

  constructor(private readonly config: CasConfig) {}

  buildLoginUrl(): string {
    const service = encodeURIComponent(this.config.serviceUrl);
    return `${this.config.baseUrl.replace(/\/+$/, '')}/login?service=${service}`;
  }

  async handleCallback(query: Record<string, string>): Promise<ExternalIdentity> {
    const ticket = query['ticket'];
    if (!ticket) {
      throw new UnauthorizedException('缺少 CAS ticket');
    }
    const service = encodeURIComponent(this.config.serviceUrl);
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/serviceValidate?ticket=${encodeURIComponent(ticket)}&service=${service}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new UnauthorizedException(`CAS 校验请求失败：HTTP ${res.status}`);
    }
    const xml = await res.text();
    const { user, attributes } = parseCasServiceValidateXml(xml);

    const employeeNumber = attributes['employeeNumber'] ?? '';
    return {
      // 有工号用工号（跨源稳定键），否则退回 CAS username
      externalId: employeeNumber || user,
      name: attributes['cn'] ?? attributes['displayName'] ?? user,
      email: attributes['mail'],
      mobile: attributes['mobile'],
      departmentExternalId: attributes['departmentNumber'],
      raw: attributes,
    };
  }
}
