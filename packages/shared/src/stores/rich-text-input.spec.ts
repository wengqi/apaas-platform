/**
 * 富文本输入守卫单测 — node 环境下的纯数据断言：
 * 净化白名单不得包含危险标签/属性，工具条命令表保持唯一且合法。
 * DOMPurify 实际净化行为依赖浏览器 DOM，由 e2e 覆盖。
 */

import { describe, expect, it } from 'vitest';
import {
  RICH_TEXT_ALLOWED_TAGS,
  RICH_TEXT_ALLOWED_ATTRS,
  RICH_TEXT_TOOLBAR,
} from './rich-text-input.js';

describe('RICH_TEXT_ALLOWED_TAGS 净化白名单', () => {
  it('仅含格式化语义标签，禁止脚本/样式/嵌入/媒体', () => {
    const banned = [
      'script',
      'style',
      'iframe',
      'frame',
      'object',
      'embed',
      'img',
      'video',
      'audio',
      'svg',
      'math',
      'form',
      'input',
      'button',
      'link',
      'meta',
      'base',
    ];
    for (const tag of banned) {
      expect(RICH_TEXT_ALLOWED_TAGS, `白名单不应包含 ${tag}`).not.toContain(tag);
    }
  });

  it('包含工具条输出所需的核心格式化标签', () => {
    for (const tag of ['b', 'i', 'u', 's', 'ol', 'ul', 'li', 'a', 'br', 'p', 'div']) {
      expect(RICH_TEXT_ALLOWED_TAGS).toContain(tag);
    }
  });

  it('无重复标签', () => {
    expect(new Set(RICH_TEXT_ALLOWED_TAGS).size).toBe(RICH_TEXT_ALLOWED_TAGS.length);
  });
});

describe('RICH_TEXT_ALLOWED_ATTRS 属性白名单', () => {
  it('仅允许链接所需属性，禁止样式与事件处理器', () => {
    expect(RICH_TEXT_ALLOWED_ATTRS).toEqual(['href', 'target']);
    for (const attr of RICH_TEXT_ALLOWED_ATTRS) {
      expect(attr.startsWith('on')).toBe(false);
    }
    expect(RICH_TEXT_ALLOWED_ATTRS).not.toContain('style');
  });
});

describe('RICH_TEXT_TOOLBAR 工具条命令表', () => {
  it('包含 8 个工具：四格式/两列表/链接/清除', () => {
    expect(RICH_TEXT_TOOLBAR.map((t) => t.command)).toEqual([
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'insertUnorderedList',
      'insertOrderedList',
      'createLink',
      'removeFormat',
    ]);
  });

  it('命令与标题均唯一且非空', () => {
    const commands = RICH_TEXT_TOOLBAR.map((t) => t.command);
    const titles = RICH_TEXT_TOOLBAR.map((t) => t.title);
    expect(new Set(commands).size).toBe(commands.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of RICH_TEXT_TOOLBAR) {
      expect(t.command).toBeTruthy();
      expect(t.title).toBeTruthy();
    }
  });
});
