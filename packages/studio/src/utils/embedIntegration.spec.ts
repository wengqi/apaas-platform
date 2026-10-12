/**
 * 嵌入集成 helpers 单测 —— URL 拼接/占位符语义/片段生成。
 */

import { describe, it, expect } from 'vitest';
import { buildEmbedUrl, buildHostSnippet } from './embedIntegration.js';

describe('buildEmbedUrl', () => {
  it('基础拼接：/embed/app/:appId/p/:slug', () => {
    expect(buildEmbedUrl('http://localhost:5174', 'app1', 'contract_list')).toBe(
      'http://localhost:5174/embed/app/app1/p/contract_list',
    );
  });

  it('去掉 base 尾部斜杠（避免双斜杠）', () => {
    expect(buildEmbedUrl('http://localhost:5174/', 'app1', 's1')).toBe(
      'http://localhost:5174/embed/app/app1/p/s1',
    );
  });

  it('非 prod 环境带 ?env=，prod 不带', () => {
    expect(buildEmbedUrl('http://r.example', 'a', 's', 'dev')).toBe(
      'http://r.example/embed/app/a/p/s?env=dev',
    );
    expect(buildEmbedUrl('http://r.example', 'a', 's', 'prod')).toBe(
      'http://r.example/embed/app/a/p/s',
    );
  });

  it('空 base 产出相对路径（预览场景；宿主片段不适用——见 buildHostSnippet）', () => {
    expect(buildEmbedUrl('', 'a', 's')).toBe('/embed/app/a/p/s');
  });
});

describe('buildHostSnippet', () => {
  it('绝对 runtimeBase：src 与 allowedOrigin 填实际值', () => {
    const snippet = buildHostSnippet({
      runtimeBase: 'http://localhost:5174',
      appId: 'app1',
      slug: 'contract_list',
    });
    expect(snippet).toContain("src: 'http://localhost:5174/embed/app/app1/p/contract_list'");
    expect(snippet).toContain("allowedOrigin: 'http://localhost:5174'");
    expect(snippet).toContain("token: '<USER_JWT>'");
    expect(snippet).toContain('createApaasEmbed');
    expect(snippet).toContain("embed.on('page-event'");
  });

  it('非绝对 runtimeBase（生产同域部署形态）：src/allowedOrigin 用显式占位符而非相对路径', () => {
    const snippet = buildHostSnippet({ runtimeBase: '', appId: 'app1', slug: 's1', env: 'dev' });
    expect(snippet).toContain("src: '<平台运行时绝对地址>/embed/app/app1/p/s1?env=dev'");
    expect(snippet).toContain("allowedOrigin: '<平台运行时 origin>'");
    // 占位符语义：绝不给宿主生成会在宿主域上解析错误的相对 URL
    expect(snippet).not.toMatch(/src: '\/embed/);
  });

  it('非法 runtimeBase 按占位符兜底（不抛异常）', () => {
    const snippet = buildHostSnippet({ runtimeBase: ':::not-a-url', appId: 'a', slug: 's' });
    expect(snippet).toContain("allowedOrigin: '<平台运行时 origin>'");
  });
});
