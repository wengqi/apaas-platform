/**
 * 轻量 Markdown 转换器单元测试（批次C1 markdown 组件核心）。
 */

import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './markdown.js';

describe('markdownToHtml', () => {
  it('标题 h1/h2/h3', () => {
    const html = markdownToHtml('# 一\n## 二\n### 三');
    expect(html).toContain('<h1>一</h1>');
    expect(html).toContain('<h2>二</h2>');
    expect(html).toContain('<h3>三</h3>');
  });

  it('粗体 / 斜体 / 行内代码', () => {
    const html = markdownToHtml('**粗** *斜* `code`');
    expect(html).toContain('<strong>粗</strong>');
    expect(html).toContain('<em>斜</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('链接带 target=_blank', () => {
    const html = markdownToHtml('[飞书](https://www.feishu.cn)');
    expect(html).toContain('href="https://www.feishu.cn"');
    expect(html).toContain('target="_blank"');
  });

  it('无序列表 / 有序列表 / 引用 / 分割线', () => {
    const html = markdownToHtml('- 甲\n- 乙\n\n1. one\n2. two\n\n> 引用\n\n---');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>甲</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote>引用</blockquote>');
    expect(html).toContain('<hr>');
  });

  it('HTML 字符被转义（XSS 基础防线）', () => {
    const html = markdownToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('空输入返回空串', () => {
    expect(markdownToHtml('')).toBe('');
  });
});
