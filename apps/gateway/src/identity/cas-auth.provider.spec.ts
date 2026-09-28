/**
 * CAS 认证适配器单测 — serviceValidate XML 解析（成功/失败/畸形）与登录 URL 构造。
 */

import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { CasAuthProvider, parseCasServiceValidateXml } from './cas-auth.provider.js';

const SUCCESS_XML = `
<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationSuccess>
    <cas:user>evan.weng</cas:user>
    <cas:attributes>
      <cas:cn>翁琦</cas:cn>
      <cas:mail>evan@example.com</cas:mail>
      <cas:employeeNumber>E10001</cas:employeeNumber>
      <cas:departmentNumber>D100</cas:departmentNumber>
    </cas:attributes>
  </cas:authenticationSuccess>
</cas:serviceResponse>`;

const FAILURE_XML = `
<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationFailure code="INVALID_TICKET">Ticket ST-xxx not recognized</cas:authenticationFailure>
</cas:serviceResponse>`;

describe('parseCasServiceValidateXml', () => {
  it('成功响应：解析 user 与属性', () => {
    const result = parseCasServiceValidateXml(SUCCESS_XML);
    expect(result.user).toBe('evan.weng');
    expect(result.attributes['cn']).toBe('翁琦');
    expect(result.attributes['employeeNumber']).toBe('E10001');
  });

  it('认证失败响应：抛 UnauthorizedException 且携带错误码', () => {
    expect(() => parseCasServiceValidateXml(FAILURE_XML)).toThrowError(UnauthorizedException);
    try {
      parseCasServiceValidateXml(FAILURE_XML);
    } catch (error) {
      expect((error as UnauthorizedException).message).toContain('INVALID_TICKET');
    }
  });

  it('畸形 XML：抛 UnauthorizedException', () => {
    expect(() => parseCasServiceValidateXml('<not-xml')).toThrowError(UnauthorizedException);
  });
});

describe('CasAuthProvider', () => {
  const config = {
    baseUrl: 'https://sso.example.com/cas/',
    serviceUrl: 'https://app.example.com/api/v1/identity/cas/callback?tenant=demo',
  };

  it('buildLoginUrl：拼接 login 地址并对 service 编码', () => {
    const provider = new CasAuthProvider(config);
    const url = provider.buildLoginUrl();
    expect(url).toContain('https://sso.example.com/cas/login?service=');
    expect(url).toContain(encodeURIComponent(config.serviceUrl));
    // 末尾多余斜杠被归一
    expect(url).not.toContain('//login');
  });

  it('handleCallback：缺 ticket 抛异常', async () => {
    const provider = new CasAuthProvider(config);
    await expect(provider.handleCallback({})).rejects.toThrowError(UnauthorizedException);
  });

  it('handleCallback：工号优先作为 externalId', async () => {
    const provider = new CasAuthProvider(config);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => SUCCESS_XML }));
    const identity = await provider.handleCallback({ ticket: 'ST-1' });
    expect(identity.externalId).toBe('E10001');
    expect(identity.name).toBe('翁琦');
    expect(identity.email).toBe('evan@example.com');
    expect(identity.departmentExternalId).toBe('D100');
    vi.unstubAllGlobals();
  });
});
